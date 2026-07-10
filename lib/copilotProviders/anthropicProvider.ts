import Anthropic from "@anthropic-ai/sdk";
import type { CopilotProvider, CopilotTurn, ProviderResponse, ProviderToolSchema } from "./types";

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

export class AnthropicProvider implements CopilotProvider {
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
    private effort?: AnthropicEffort,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async send(params: {
    systemPrompt: string;
    tools: ProviderToolSchema[];
    turns: CopilotTurn[];
    signal?: AbortSignal;
  }): Promise<ProviderResponse> {
    const messages: Anthropic.MessageParam[] = [];
    for (const turn of params.turns) {
      switch (turn.kind) {
        case "user":
          messages.push({ role: "user", content: turn.text });
          break;
        case "assistant":
          messages.push({ role: "assistant", content: turn.text });
          break;
        case "assistantToolCalls":
          messages.push({
            role: "assistant",
            content: turn.calls.map((c) => ({
              type: "tool_use" as const,
              id: c.id,
              name: c.name,
              input: c.input,
            })),
          });
          break;
        case "toolResults":
          messages.push({
            role: "user",
            content: turn.results.map((r) => ({
              type: "tool_result" as const,
              tool_use_id: r.id,
              content: r.output,
              is_error: r.isError,
            })),
          });
          break;
      }
    }

    const toolDefinitions: Anthropic.Tool[] = params.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }));

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          output_config: this.effort ? { effort: this.effort } : undefined,
          system: [
            { type: "text", text: params.systemPrompt, cache_control: { type: "ephemeral" } },
          ],
          tools: toolDefinitions,
          messages,
        },
        { signal: params.signal },
      );
    } catch (err) {
      if (params.signal?.aborted) throw err; // caller cancelled — let the abort propagate as-is, not a generic error
      console.error("[executive-copilot] Anthropic API call failed:", err);
      if (
        err instanceof Anthropic.RateLimitError ||
        err instanceof Anthropic.InternalServerError ||
        err instanceof Anthropic.APIConnectionError
      ) {
        throw new Error("The assistant is temporarily busy. Please try again in a moment.");
      }
      throw new Error("The assistant is temporarily unavailable. Please try again.");
    }

    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input }));
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";

    return {
      text,
      toolCalls,
      finished: response.stop_reason !== "tool_use",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? undefined,
      },
    };
  }
}
