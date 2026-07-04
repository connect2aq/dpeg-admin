// Generic, read-only, provider-agnostic tool-calling agent loop — contains no
// DPEG-specific or Executive-Copilot-specific code, and no vendor-specific code either.
// Meant to be the shared base for future copilot products (Agent Copilot, Investor
// Copilot, ...), each of which can run on whichever CopilotProvider (Anthropic, DeepSeek,
// ...) is configured, without touching this file.
import type { CopilotProvider, CopilotTurn, JSONSchema, ProviderToolCall } from "./copilotProviders/types";

export interface CopilotTool {
  definition: {
    name: string;
    description: string;
    input_schema: JSONSchema;
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

// Core rules every copilot built on this engine must follow, regardless of domain or
// provider. The domain-specific systemPromptPrefix (tool list, product context, curated
// memory) is prepended to this.
const CORE_SYSTEM_PROMPT = `
You are a read-only, informational assistant. You cannot take any action — you cannot approve, reject, resend documents, change statuses, or modify any record, even if the user asks you to. If asked to perform an action, explain that you can only look up and analyze information, and that the user must use the relevant page in the application to make the change.

Only state figures, names, or dates that came from a tool call in this conversation. Never estimate, guess, or recall a number from general knowledge. If the available tools cannot answer the question, say so plainly rather than guessing.

When comparing periods, cohorts, or entities, be explicit about what data you pulled (and its date range or filters), so the answer is checkable against the tool results you used.

Once you have the information needed to answer the question, stop calling tools and respond directly. Do not make additional or repeat tool calls out of caution once you already have what you need.
`.trim();

export async function runCopilotAgent(params: {
  provider: CopilotProvider;
  tools: CopilotTool[];
  systemPromptPrefix: string;
  token: string;
  conversationHistory: CopilotConversationTurn[];
  question: string;
}): Promise<CopilotAgentResult> {
  const { provider, tools, systemPromptPrefix, token, conversationHistory, question } = params;

  const trimmedHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
  const turns: CopilotTurn[] = [
    ...trimmedHistory.map((t): CopilotTurn => ({ kind: t.role, text: t.content })),
    { kind: "user", text: question },
  ];

  const toolSchemas = tools.map((t) => ({
    name: t.definition.name,
    description: t.definition.description,
    parameters: t.definition.input_schema,
  }));

  const systemPrompt = `${systemPromptPrefix}\n\n${CORE_SYSTEM_PROMPT}`;
  const toolsUsed = new Set<string>();
  const usageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await provider.send({ systemPrompt, tools: toolSchemas, turns });

    usageTotals.input += response.usage.inputTokens;
    usageTotals.output += response.usage.outputTokens;
    usageTotals.cacheRead += response.usage.cacheReadTokens ?? 0;
    usageTotals.cacheWrite += response.usage.cacheWriteTokens ?? 0;

    if (response.finished || response.toolCalls.length === 0) {
      console.log(
        `[executive-copilot] answered in ${iteration + 1} call(s) — input:${usageTotals.input} output:${usageTotals.output} cacheRead:${usageTotals.cacheRead} cacheWrite:${usageTotals.cacheWrite} tools:[${[...toolsUsed].join(",")}]`,
      );
      return { answer: response.text, sources: [...toolsUsed] };
    }

    turns.push({ kind: "assistantToolCalls", calls: response.toolCalls, providerData: response.providerData });

    console.log(
      `[executive-copilot] iteration ${iteration + 1}: calling ${response.toolCalls.map((c) => `${c.name}(${JSON.stringify(c.input)})`).join(", ")}`,
    );

    const results = await Promise.all(
      response.toolCalls.map(async (call: ProviderToolCall) => {
        const tool = tools.find((t) => t.definition.name === call.name);
        toolsUsed.add(call.name);
        try {
          const result = tool ? await tool.execute(call.input, token) : { error: `Unknown tool ${call.name}` };
          const output = JSON.stringify(result);
          console.log(
            `[executive-copilot]   → ${call.name} returned ${output.length} chars${output.length < 500 ? `: ${output}` : ""}`,
          );
          return { id: call.id, name: call.name, output };
        } catch (err) {
          console.error(`[executive-copilot] Tool "${call.name}" failed:`, err);
          return {
            id: call.id,
            name: call.name,
            output: err instanceof Error ? err.message : String(err),
            isError: true,
          };
        }
      }),
    );
    turns.push({ kind: "toolResults", results });
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
