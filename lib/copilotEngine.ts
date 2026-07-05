// Generic, read-only, provider-agnostic tool-calling agent loop — contains no
// DPEG-specific or Executive-Copilot-specific code, and no vendor-specific code either.
// Meant to be the shared base for future copilot products (Agent Copilot, Investor
// Copilot, ...), each of which can run on whichever CopilotProvider (Anthropic, DeepSeek,
// ...) is configured, without touching this file.
import type { CopilotProvider, CopilotTurn, JSONSchema, ProviderToolCall } from "./copilotProviders/types";

// A linkable record a tool's result referenced (e.g. a specific redemption or
// application). Optional — most tools return aggregates with nothing to link to.
export interface CopilotCitation {
  type: string;
  id: number | string;
  label?: string;
  href: string;
}

export interface CopilotTool {
  definition: {
    name: string;
    description: string;
    input_schema: JSONSchema;
  };
  execute: (input: unknown, token: string) => Promise<unknown>;
  // Given a tool's own raw result, pull out any linkable records it contains. Optional —
  // only implemented by tools whose results reference something with a real detail page.
  extractCitations?: (result: unknown) => CopilotCitation[];
}

export interface CopilotConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotAgentResult {
  answer: string;
  sources: string[];
  citations: CopilotCitation[];
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

// Standard "give up waiting" wrapper — does not cancel the underlying work (JS has no
// true cross-cutting cancellation without threading an AbortSignal through every layer),
// it only stops the caller from waiting past `ms`. Paired with backendGet's own per-call
// timeout in lib/executiveCopilot/tools.ts, which bounds the actual work too.
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export async function runCopilotAgent(params: {
  provider: CopilotProvider;
  tools: CopilotTool[];
  systemPromptPrefix: string;
  token: string;
  conversationHistory: CopilotConversationTurn[];
  question: string;
  // When the caller (the route, driven by the client disconnecting via its own Stop
  // button, or a last-resort safety-net timeout) aborts this, the loop stops making
  // further LLM calls at the next check point instead of running to completion on an
  // abandoned question.
  signal?: AbortSignal;
}): Promise<CopilotAgentResult> {
  const { provider, tools, systemPromptPrefix, token, conversationHistory, question, signal } = params;

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
  const citationsByHref = new Map<string, CopilotCitation>();

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (signal?.aborted) {
      console.log(`[executive-copilot] cancelled before iteration ${iteration + 1} — question was abandoned`);
      throw new Error("Cancelled");
    }
    const response = await provider.send({ systemPrompt, tools: toolSchemas, turns, signal });

    usageTotals.input += response.usage.inputTokens;
    usageTotals.output += response.usage.outputTokens;
    usageTotals.cacheRead += response.usage.cacheReadTokens ?? 0;
    usageTotals.cacheWrite += response.usage.cacheWriteTokens ?? 0;

    if (response.finished || response.toolCalls.length === 0) {
      console.log(
        `[executive-copilot] answered in ${iteration + 1} call(s) — input:${usageTotals.input} output:${usageTotals.output} cacheRead:${usageTotals.cacheRead} cacheWrite:${usageTotals.cacheWrite} tools:[${[...toolsUsed].join(",")}]`,
      );
      return {
        answer: normalizeMarkdownTables(renderStructuredTables(response.text)),
        sources: [...toolsUsed],
        citations: [...citationsByHref.values()],
      };
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
          if (tool?.extractCitations) {
            for (const c of tool.extractCitations(result)) citationsByHref.set(c.href, c);
          }
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
    citations: [...citationsByHref.values()],
  };
}

// Parses the follow-up suggestions out of a model's raw text response. Exported
// separately from suggestFollowUps so the parsing/robustness logic (stripping an
// unwanted code fence, filtering to non-empty strings, capping the count) can be unit
// tested without a real or mocked provider call.
export function parseFollowUps(text: string): string[] {
  try {
    // Models sometimes wrap JSON in a markdown code fence despite being told not to --
    // strip that before parsing rather than fail outright.
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((q): q is string => typeof q === "string" && q.trim().length > 0).slice(0, 3);
  } catch {
    return [];
  }
}

// A single, tool-free call asking the model to suggest natural follow-up questions given
// the Q&A that just happened — deliberately separate from runCopilotAgent's tool-calling
// loop (no backend data needed, no iteration loop, just one cheap round-trip) so it can
// run as an independent, non-blocking request after the main answer is already back with
// the user. Resilient by design: a failure here (rate limit, provider hiccup) just means
// no suggestions are shown, not a broken question-answering experience.
export async function suggestFollowUps(params: {
  provider: CopilotProvider;
  systemPromptPrefix: string;
  question: string;
  answer: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  const prompt = `The admin just asked: "${params.question}"

And received this answer:
${params.answer}

Suggest exactly 3 short, natural follow-up questions this admin might reasonably ask next, given what they just learned. Respond with ONLY a JSON array of 3 strings and nothing else -- e.g. ["...", "...", "..."].`;

  try {
    const response = await params.provider.send({
      systemPrompt: params.systemPromptPrefix,
      tools: [],
      turns: [{ kind: "user", text: prompt }],
      signal: params.signal,
    });
    return parseFollowUps(response.text);
  } catch (err) {
    console.error("[executive-copilot] follow-up suggestion call failed:", err);
    return [];
  }
}

interface StructuredTableSpec {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

// Matches a ```table fenced block containing JSON — the model's alternative to
// hand-writing markdown pipe syntax for tabular data (see the prompt rule in
// lib/executiveCopilot/tools.ts that asks for this format).
const STRUCTURED_TABLE_BLOCK_PATTERN = /```table\s*\n([\s\S]*?)\n```/g;

function escapeTableCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function renderTableRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function renderStructuredTable(spec: StructuredTableSpec): string {
  const header = renderTableRow(spec.columns.map(escapeTableCell));
  const divider = renderTableRow(spec.columns.map(() => "---"));
  const body = spec.rows.map((row) => renderTableRow(spec.columns.map((col) => escapeTableCell(row[col]))));
  return [header, divider, ...body].join("\n");
}

// Recovers what it can from a ```table block whose JSON doesn't parse as a whole --
// e.g. one row is missing a key ({"A": "1", "3.7%", "✅ Easily"} instead of
// {"A": "1", "B": "3.7%", "C": "✅ Easily"}), which is a real failure mode the model has
// produced. A single bad row shouldn't sink the other nine that parsed fine: this pulls
// the "columns" array out with a targeted regex, then walks the "rows" array tracking
// brace depth to find each individual {...} object's exact boundaries and parses them one
// at a time, silently dropping only the ones that fail rather than the whole table.
function recoverPartialTable(jsonText: string): StructuredTableSpec | null {
  const columnsMatch = jsonText.match(/"columns"\s*:\s*(\[[^\]]*\])/);
  if (!columnsMatch) return null;
  let columns: unknown;
  try {
    columns = JSON.parse(columnsMatch[1]);
  } catch {
    return null;
  }
  if (!Array.isArray(columns)) return null;

  const rowsKeyIndex = jsonText.indexOf('"rows"');
  const arrayStart = rowsKeyIndex === -1 ? -1 : jsonText.indexOf("[", rowsKeyIndex);
  if (arrayStart === -1) return null;

  const rows: Record<string, unknown>[] = [];
  let depth = 0;
  let objectStart = -1;
  for (let i = arrayStart; i < jsonText.length; i++) {
    const char = jsonText[i];
    if (char === "{") {
      if (depth === 0) objectStart = i;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        try {
          const row = JSON.parse(jsonText.slice(objectStart, i + 1));
          if (row && typeof row === "object" && !Array.isArray(row)) rows.push(row);
        } catch {
          // this one row didn't parse -- skip it, keep going with the rest
        }
        objectStart = -1;
      }
    } else if (char === "]" && depth === 0) {
      break; // end of the rows array
    }
  }

  return rows.length > 0 ? { columns, rows } : null;
}

// Converts the model's ```table JSON blocks into real markdown tables, keyed by the exact
// column header string per row rather than positional array order. Named fields are the
// actual fix for column drift (e.g. the model folding a rank into the name cell for the
// top 3 rows, then giving the rest their own separate rank cell): every row must
// explicitly say which value belongs to which named column, so there's no implicit,
// easy-to-drift positional convention to maintain across many rows. A row missing a key
// just renders an empty cell for that column -- the header's column count always wins.
// If the JSON doesn't parse as a whole, falls back to recovering whichever individual
// rows DO parse (see recoverPartialTable) before giving up and leaving the original
// fenced block untouched (visible, reportable) as a last resort.
export function renderStructuredTables(text: string): string {
  return text.replace(STRUCTURED_TABLE_BLOCK_PATTERN, (match, jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText) as StructuredTableSpec;
      if (!Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)) return match;
      return renderStructuredTable(parsed);
    } catch {
      const recovered = recoverPartialTable(jsonText);
      return recovered ? renderStructuredTable(recovered) : match;
    }
  });
}

// A markdown table row: a line starting and ending with "|" (allowing trailing
// whitespace). The model's raw table markup is trusted for everything except cell count.
const TABLE_ROW_PATTERN = /^\|(.*)\|\s*$/;
// The GFM header/body divider row: cells made up only of dashes/colons (alignment
// markers), e.g. "|---|---|" or "| :--- | ---: |".
const TABLE_DIVIDER_PATTERN = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitTableRowCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  // Split on unescaped pipes only, so a literal "\|" inside a cell's own text survives.
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

function joinTableRowCells(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

// Forces every markdown table in the model's answer to have exactly as many cells per
// row as its header — deterministically, in code, regardless of what the model actually
// produced. This is the real fix for column misalignment (e.g. the model giving early
// rows a rank folded into the name cell, then switching to a separate bare-number rank
// cell partway down a table): a prompt instruction can reduce how often that happens, but
// only code running after generation can guarantee it never reaches the rendered UI.
// Short rows are padded with empty cells; long rows are truncated — both silent, since
// there's no way to know which of the model's cells was misplaced, only that the count
// doesn't match. Skips content inside fenced code blocks, so a ``` block that happens to
// contain "|" characters is never mistaken for a table.
export function normalizeMarkdownTables(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];
  let inFence = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      output.push(line);
      i += 1;
      continue;
    }

    const nextLine = lines[i + 1] ?? "";
    const isTableStart = !inFence && TABLE_ROW_PATTERN.test(line) && TABLE_DIVIDER_PATTERN.test(nextLine.trim());

    if (isTableStart) {
      const headerCells = splitTableRowCells(line);
      output.push(joinTableRowCells(headerCells));
      output.push(nextLine);
      i += 2;
      while (i < lines.length && TABLE_ROW_PATTERN.test(lines[i])) {
        const rowCells = splitTableRowCells(lines[i]);
        const normalized = headerCells.map((_, idx) => rowCells[idx] ?? "");
        output.push(joinTableRowCells(normalized));
        i += 1;
      }
      continue;
    }

    output.push(line);
    i += 1;
  }

  return output.join("\n");
}
