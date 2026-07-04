// DeepSeek adapter — uses DeepSeek's OpenAI-compatible chat completions API via the
// `openai` SDK pointed at DeepSeek's base URL.
//
// Verified against https://api-docs.deepseek.com/ and
// https://api-docs.deepseek.com/guides/thinking_mode (2026-07-04):
//   - Base URL: https://api.deepseek.com. Model: deepseek-v4-flash (deepseek-chat and
//     deepseek-reasoner are deprecated 2026-07-24 — deepseek-v4-flash's "thinking"
//     toggle now covers both of their former roles).
//   - Thinking mode is enabled by default and IS compatible with tool calling, but comes
//     with a hard requirement: when the model's response includes tool calls, its
//     `reasoning_content` must be replayed back on the assistant message in the next
//     request, or the API returns a 400. That's what CopilotTurn.providerData carries —
//     it's opaque to the engine, only this adapter reads/writes it.
//   - `thinking` and `reasoning_effort` are DeepSeek-specific extensions not part of the
//     official OpenAI schema, so they're added via a type cast rather than the SDK's
//     typed params. Same for reading `reasoning_content` back off the response message.
//   - thinking mode does not support temperature/top_p/presence_penalty/frequency_penalty
//     — none of those are set here, so no conflict.
import OpenAI, { APIConnectionError, InternalServerError, RateLimitError } from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { CopilotProvider, CopilotTurn, ProviderResponse, ProviderToolSchema } from "./types";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const MAX_TOKENS = 8192; // higher than the Anthropic adapter's 4096 — reasoning tokens eat into this budget before the final answer

interface DeepSeekProviderData {
  reasoningContent?: string;
}

export type DeepSeekReasoningEffort = "high" | "max";

export class DeepSeekProvider implements CopilotProvider {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string,
    private reasoningEffort: DeepSeekReasoningEffort = "high",
  ) {
    this.client = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
  }

  async send(params: {
    systemPrompt: string;
    tools: ProviderToolSchema[];
    turns: CopilotTurn[];
    signal?: AbortSignal;
  }): Promise<ProviderResponse> {
    const messages: ChatCompletionMessageParam[] = [{ role: "system", content: params.systemPrompt }];

    for (const turn of params.turns) {
      switch (turn.kind) {
        case "user":
          messages.push({ role: "user", content: turn.text });
          break;
        case "assistant":
          messages.push({ role: "assistant", content: turn.text });
          break;
        case "assistantToolCalls": {
          const data = turn.providerData as DeepSeekProviderData | undefined;
          const assistantMessage: ChatCompletionMessageParam & { reasoning_content?: string } = {
            role: "assistant",
            content: null,
            tool_calls: turn.calls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: JSON.stringify(c.input) },
            })),
          };
          // Required by DeepSeek thinking mode whenever tool calls occurred — omitting
          // this on a turn that had reasoning content returns a 400 on the next request.
          if (data?.reasoningContent) assistantMessage.reasoning_content = data.reasoningContent;
          messages.push(assistantMessage);
          break;
        }
        case "toolResults":
          for (const r of turn.results) {
            // OpenAI-style APIs want one "tool" message per call, unlike Anthropic which
            // bundles all of a turn's results into a single user message.
            messages.push({ role: "tool", tool_call_id: r.id, content: r.output });
          }
          break;
      }
    }

    const toolDefinitions: ChatCompletionTool[] = params.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    // thinking/reasoning_effort are DeepSeek-specific extensions to the OpenAI-compatible
    // schema — not in the SDK's own types, hence the cast.
    const requestParams = {
      model: this.model,
      max_tokens: MAX_TOKENS,
      messages,
      tools: toolDefinitions,
      thinking: { type: "enabled" as const },
      reasoning_effort: this.reasoningEffort,
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
      thinking: { type: "enabled" | "disabled" };
      reasoning_effort: DeepSeekReasoningEffort;
    };

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await this.client.chat.completions.create(requestParams, { signal: params.signal });
    } catch (err) {
      if (params.signal?.aborted) throw err; // caller cancelled — let the abort propagate as-is, not a generic error
      console.error("[executive-copilot] DeepSeek API call failed:", err);
      if (err instanceof RateLimitError || err instanceof InternalServerError || err instanceof APIConnectionError) {
        throw new Error("The assistant is temporarily busy. Please try again in a moment.");
      }
      throw new Error("The assistant is temporarily unavailable. Please try again.");
    }

    const choice = response.choices[0];
    const message = choice.message as OpenAI.Chat.Completions.ChatCompletionMessage & {
      reasoning_content?: string;
    };
    const toolCalls = (message.tool_calls ?? [])
      .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => tc.type === "function")
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || "{}"),
      }));

    // Automatic prompt-cache hit/miss fields DeepSeek reportedly adds to usage — not in
    // the SDK's standard CompletionUsage type, read defensively.
    const usageAny = response.usage as unknown as Record<string, number> | undefined;

    return {
      text: message.content ?? "",
      toolCalls,
      finished: toolCalls.length === 0,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        cacheReadTokens: usageAny?.prompt_cache_hit_tokens,
        cacheWriteTokens: usageAny?.prompt_cache_miss_tokens,
      },
      providerData: message.reasoning_content
        ? ({ reasoningContent: message.reasoning_content } satisfies DeepSeekProviderData)
        : undefined,
    };
  }
}
