// Provider-agnostic contract for the copilot agent loop (lib/copilotEngine.ts). Any LLM
// provider (Anthropic, DeepSeek, ...) implements CopilotProvider; the engine only ever
// talks to this interface, never to a specific vendor SDK directly.

// A JSON-Schema-shaped tool parameter definition. Both Anthropic's input_schema and
// OpenAI-style function.parameters use plain JSON Schema, so this one shape covers both.
export type JSONSchema = Record<string, unknown>;

export interface ProviderToolSchema {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export interface ProviderToolCall {
  id: string;
  name: string;
  input: unknown; // already-parsed arguments, regardless of how the wire format encodes them
}

export interface ProviderToolResult {
  id: string; // matches the ProviderToolCall.id it answers
  name: string;
  output: string;
  isError?: boolean;
}

// One step of the conversation, in a shape neutral enough for any provider to serialize
// into its own wire format. "assistantToolCalls" and "toolResults" are kept as distinct
// turns (rather than folded into raw messages) because providers disagree on shape here —
// Anthropic bundles all of one turn's tool results into a single user message, OpenAI-style
// APIs send one "tool" role message per call. Each adapter decides how to serialize this.
// providerData is opaque to the engine — it's data one provider's send() call returned
// that the SAME provider needs re-attached when it later serializes this turn back into
// a request (e.g. DeepSeek's reasoning_content, which must be replayed alongside tool
// calls or the API 400s). The engine only ever carries it through; it never inspects it.
export type CopilotTurn =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "assistantToolCalls"; calls: ProviderToolCall[]; providerData?: unknown }
  | { kind: "toolResults"; results: ProviderToolResult[] };

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface ProviderResponse {
  text: string;
  toolCalls: ProviderToolCall[];
  finished: boolean; // true when there are no more tool calls to execute — text is the final answer
  usage: ProviderUsage;
  providerData?: unknown; // see CopilotTurn's assistantToolCalls.providerData
}

export interface CopilotProvider {
  send(params: {
    systemPrompt: string;
    tools: ProviderToolSchema[];
    turns: CopilotTurn[];
  }): Promise<ProviderResponse>;
}
