// Generic, read-only tool-calling agent loop for Claude — contains no DPEG-specific
// or Executive-Copilot-specific code. Meant to be the shared base for future copilot
// products (Agent Copilot, Investor Copilot, etc.) — each supplies its own CopilotTool[]
// and a domain-specific system-prompt prefix.
import Anthropic from "@anthropic-ai/sdk";

export interface CopilotTool {
  definition: {
    name: string;
    description: string;
    input_schema: Anthropic.Tool.InputSchema;
  };
  execute: (input: unknown, token: string) => Promise<unknown>;
}

export interface CopilotConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotAgentResult {
  answer: string;
  sources: string[];
}

const MAX_TOOL_ITERATIONS = 6; // tunable — bounds worst-case latency/cost per question
// Every prior Q&A turn gets resent as input tokens on every subsequent question — capping
// this is what keeps a long-running conversation's cost from growing without bound. 8
// messages = last 4 Q&A pairs; older context is dropped, not summarized.
const MAX_HISTORY_MESSAGES = 8;

// Core rules every copilot built on this engine must follow, regardless of domain.
// The domain-specific systemPromptPrefix (tool list, product context) is prepended to this.
const CORE_SYSTEM_PROMPT = `
You are a read-only, informational assistant. You cannot take any action — you cannot approve, reject, resend documents, change statuses, or modify any record, even if the user asks you to. If asked to perform an action, explain that you can only look up and analyze information, and that the user must use the relevant page in the application to make the change.

Only state figures, names, or dates that came from a tool call in this conversation. Never estimate, guess, or recall a number from general knowledge. If the available tools cannot answer the question, say so plainly rather than guessing.

When comparing periods, cohorts, or entities, be explicit about what data you pulled (and its date range or filters), so the answer is checkable against the tool results you used.
`.trim();

export async function runCopilotAgent(params: {
  tools: CopilotTool[];
  systemPromptPrefix: string;
  apiKey: string;
  model: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  token: string;
  conversationHistory: CopilotConversationTurn[];
  question: string;
}): Promise<CopilotAgentResult> {
  const { tools, systemPromptPrefix, apiKey, model, effort, token, conversationHistory, question } = params;
  const client = new Anthropic({ apiKey });

  const trimmedHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
  const messages: Anthropic.MessageParam[] = [
    ...trimmedHistory.map((t): Anthropic.MessageParam => ({ role: t.role, content: t.content })),
    { role: "user", content: question },
  ];

  const toolDefinitions: Anthropic.Tool[] = tools.map((t) => ({
    name: t.definition.name,
    description: t.definition.description,
    input_schema: t.definition.input_schema,
  }));

  const toolsUsed = new Set<string>();
  const usageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        output_config: effort ? { effort } : undefined,
        system: [
          {
            type: "text",
            text: `${systemPromptPrefix}\n\n${CORE_SYSTEM_PROMPT}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: toolDefinitions,
        messages,
      });
    } catch (err) {
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

    messages.push({ role: "assistant", content: response.content });

    usageTotals.input += response.usage.input_tokens;
    usageTotals.output += response.usage.output_tokens;
    usageTotals.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    usageTotals.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;

    if (response.stop_reason !== "tool_use") {
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
      console.log(
        `[executive-copilot] answered in ${iteration + 1} call(s) — input:${usageTotals.input} output:${usageTotals.output} cacheRead:${usageTotals.cacheRead} cacheWrite:${usageTotals.cacheWrite} tools:[${[...toolsUsed].join(",")}]`,
      );
      return { answer: text, sources: [...toolsUsed] };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const tool = tools.find((t) => t.definition.name === block.name);
      toolsUsed.add(block.name);
      try {
        const result = tool
          ? await tool.execute(block.input, token)
          : { error: `Unknown tool ${block.name}` };
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (err) {
        console.error(`[executive-copilot] Tool "${block.name}" failed:`, err);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: err instanceof Error ? err.message : String(err),
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  console.log(
    `[executive-copilot] hit iteration cap — input:${usageTotals.input} output:${usageTotals.output} cacheRead:${usageTotals.cacheRead} cacheWrite:${usageTotals.cacheWrite} tools:[${[...toolsUsed].join(",")}]`,
  );
  return {
    answer:
      "I wasn't able to fully answer within the allotted number of data lookups. Try narrowing the question.",
    sources: [...toolsUsed],
  };
}
