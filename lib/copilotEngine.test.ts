import { describe, it, expect, vi } from "vitest";
import { runCopilotAgent, withTimeout, suggestFollowUps, parseFollowUps, type CopilotTool } from "./copilotEngine";
import type { CopilotProvider, ProviderResponse } from "./copilotProviders/types";

function usage(overrides: Partial<ProviderResponse["usage"]> = {}): ProviderResponse["usage"] {
  return { inputTokens: 10, outputTokens: 5, ...overrides };
}

function makeProvider(...responses: ProviderResponse[]): CopilotProvider & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn();
  responses.forEach((r) => send.mockResolvedValueOnce(r));
  return { send };
}

function makeTool(overrides: Partial<CopilotTool> = {}): CopilotTool {
  return {
    definition: { name: "get_thing", description: "Gets a thing", input_schema: { type: "object", properties: {} } },
    execute: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

const baseParams = {
  systemPromptPrefix: "You are a test copilot.",
  token: "test-token",
  conversationHistory: [],
  question: "What's the answer?",
};

describe("runCopilotAgent", () => {
  it("returns the answer directly when the provider finishes with no tool calls", async () => {
    const provider = makeProvider({ text: "42.", toolCalls: [], finished: true, usage: usage() });
    const result = await runCopilotAgent({ ...baseParams, provider, tools: [] });

    expect(result.answer).toBe("42.");
    expect(result.sources).toEqual([]);
    expect(result.citations).toEqual([]);
    expect(provider.send).toHaveBeenCalledTimes(1);

    const call = provider.send.mock.calls[0][0];
    expect(call.systemPrompt).toContain("You are a test copilot.");
    expect(call.turns).toEqual([{ kind: "user", text: "What's the answer?" }]);
  });

  it("executes a requested tool and feeds the result back for a second round", async () => {
    const tool = makeTool();
    const provider = makeProvider(
      {
        text: "",
        toolCalls: [{ id: "call_1", name: "get_thing", input: { x: 1 } }],
        finished: false,
        usage: usage(),
      },
      { text: "The thing is ok.", toolCalls: [], finished: true, usage: usage() },
    );

    const result = await runCopilotAgent({ ...baseParams, provider, tools: [tool] });

    expect(result.answer).toBe("The thing is ok.");
    expect(result.sources).toEqual(["get_thing"]);
    expect(tool.execute).toHaveBeenCalledWith({ x: 1 }, "test-token");
    expect(provider.send).toHaveBeenCalledTimes(2);

    const secondCallTurns = provider.send.mock.calls[1][0].turns;
    expect(secondCallTurns).toContainEqual({
      kind: "assistantToolCalls",
      calls: [{ id: "call_1", name: "get_thing", input: { x: 1 } }],
      providerData: undefined,
    });
    const toolResultsTurn = secondCallTurns.find((t: { kind: string }) => t.kind === "toolResults");
    expect(toolResultsTurn.results).toEqual([{ id: "call_1", name: "get_thing", output: JSON.stringify({ ok: true }) }]);
  });

  it("aggregates citations from extractCitations, deduping by href across multiple tool calls", async () => {
    const tool = makeTool({
      execute: vi.fn().mockResolvedValue({ items: [{ id: 1 }] }),
      extractCitations: () => [{ type: "application", id: 1, label: "Alice", href: "/applications/1" }],
    });
    const provider = makeProvider(
      {
        text: "",
        toolCalls: [
          { id: "call_1", name: "get_thing", input: {} },
          { id: "call_2", name: "get_thing", input: {} },
        ],
        finished: false,
        usage: usage(),
      },
      { text: "Done.", toolCalls: [], finished: true, usage: usage() },
    );

    const result = await runCopilotAgent({ ...baseParams, provider, tools: [tool] });

    // Same tool called twice in one round -> same citation href -> deduped to one entry.
    expect(result.citations).toEqual([{ type: "application", id: 1, label: "Alice", href: "/applications/1" }]);
  });

  it("reports a failed tool call back to the provider as an error result instead of throwing", async () => {
    const tool = makeTool({ execute: vi.fn().mockRejectedValue(new Error("backend is down")) });
    const provider = makeProvider(
      { text: "", toolCalls: [{ id: "call_1", name: "get_thing", input: {} }], finished: false, usage: usage() },
      { text: "I couldn't reach that data.", toolCalls: [], finished: true, usage: usage() },
    );

    const result = await runCopilotAgent({ ...baseParams, provider, tools: [tool] });

    expect(result.answer).toBe("I couldn't reach that data.");
    const secondCallTurns = provider.send.mock.calls[1][0].turns;
    const toolResultsTurn = secondCallTurns.find((t: { kind: string }) => t.kind === "toolResults");
    expect(toolResultsTurn.results).toEqual([{ id: "call_1", name: "get_thing", output: "backend is down", isError: true }]);
  });

  it("stops after the iteration cap and returns a fallback message if the provider never finishes", async () => {
    const tool = makeTool();
    const send = vi.fn().mockResolvedValue({
      text: "",
      toolCalls: [{ id: "call_x", name: "get_thing", input: {} }],
      finished: false,
      usage: usage(),
    });
    const provider: CopilotProvider = { send };

    const result = await runCopilotAgent({ ...baseParams, provider, tools: [tool] });

    expect(result.answer).toMatch(/wasn't able to fully answer/i);
    // Bounded, not infinite -- the exact cap is an internal tuning constant, so this just
    // guards against a runaway loop rather than pinning the precise number.
    expect(send.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it("truncates conversation history to the most recent messages", async () => {
    const provider = makeProvider({ text: "ok", toolCalls: [], finished: true, usage: usage() });
    const longHistory = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `message ${i}`,
    }));

    await runCopilotAgent({ ...baseParams, provider, tools: [], conversationHistory: longHistory });

    const turns = provider.send.mock.calls[0][0].turns;
    // MAX_HISTORY_MESSAGES (8) trimmed messages + the new question turn.
    expect(turns).toHaveLength(9);
    expect(turns[turns.length - 1]).toEqual({ kind: "user", text: "What's the answer?" });
  });

  it("throws before calling the provider at all if the signal is already aborted", async () => {
    const provider = makeProvider({ text: "unreachable", toolCalls: [], finished: true, usage: usage() });
    const controller = new AbortController();
    controller.abort();

    await expect(runCopilotAgent({ ...baseParams, provider, tools: [], signal: controller.signal })).rejects.toThrow(
      "Cancelled",
    );
    expect(provider.send).not.toHaveBeenCalled();
  });
});

describe("withTimeout", () => {
  it("resolves with the original value if it finishes before the timeout", async () => {
    await expect(withTimeout(Promise.resolve("done"), 1000, "too slow")).resolves.toBe("done");
  });

  it("rejects with the given message if the promise doesn't settle in time", async () => {
    const neverSettles = new Promise(() => {});
    await expect(withTimeout(neverSettles, 10, "too slow")).rejects.toThrow("too slow");
  });
});

describe("parseFollowUps", () => {
  it("parses a plain JSON array of strings", () => {
    expect(parseFollowUps('["a", "b", "c"]')).toEqual(["a", "b", "c"]);
  });

  it("strips a markdown code fence the model added despite being told not to", () => {
    expect(parseFollowUps('```json\n["a", "b"]\n```')).toEqual(["a", "b"]);
    expect(parseFollowUps("```\n[\"a\", \"b\"]\n```")).toEqual(["a", "b"]);
  });

  it("caps the result at 3 even if the model returns more", () => {
    expect(parseFollowUps('["a", "b", "c", "d", "e"]')).toEqual(["a", "b", "c"]);
  });

  it("drops non-string and empty-string entries", () => {
    expect(parseFollowUps('["a", "", "  ", 42, null, "b"]')).toEqual(["a", "b"]);
  });

  it("returns an empty array for invalid JSON instead of throwing", () => {
    expect(parseFollowUps("not json at all")).toEqual([]);
  });

  it("returns an empty array when the JSON parses but isn't an array", () => {
    expect(parseFollowUps('{"a": 1}')).toEqual([]);
    expect(parseFollowUps('"just a string"')).toEqual([]);
  });
});

describe("suggestFollowUps", () => {
  it("returns the parsed follow-ups from the provider's response", async () => {
    const provider = makeProvider({
      text: '["Question A?", "Question B?", "Question C?"]',
      toolCalls: [],
      finished: true,
      usage: usage(),
    });

    const result = await suggestFollowUps({
      provider,
      systemPromptPrefix: "context",
      question: "How much cash do we have?",
      answer: "We have $1M.",
    });

    expect(result).toEqual(["Question A?", "Question B?", "Question C?"]);
    // No tools should ever be offered to this call -- it's not meant to invoke backend
    // data lookups, just suggest questions from the Q&A already in hand.
    expect(provider.send.mock.calls[0][0].tools).toEqual([]);
  });

  it("returns an empty array (not a throw) if the provider call fails", async () => {
    const provider: CopilotProvider = { send: vi.fn().mockRejectedValue(new Error("provider down")) };
    const result = await suggestFollowUps({
      provider,
      systemPromptPrefix: "context",
      question: "q",
      answer: "a",
    });
    expect(result).toEqual([]);
  });

  it("returns an empty array if the model's response isn't valid JSON", async () => {
    const provider = makeProvider({ text: "Sure! Here are some ideas...", toolCalls: [], finished: true, usage: usage() });
    const result = await suggestFollowUps({ provider, systemPromptPrefix: "context", question: "q", answer: "a" });
    expect(result).toEqual([]);
  });
});
