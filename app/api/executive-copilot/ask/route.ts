import { NextRequest, NextResponse } from "next/server";
import { runCopilotAgent, withTimeout, type CopilotConversationTurn } from "@/lib/copilotEngine";
import { EXECUTIVE_COPILOT_TOOLS, EXECUTIVE_COPILOT_SYSTEM_PROMPT_PREFIX } from "@/lib/executiveCopilot/tools";
import { formatMemoryForPrompt } from "@/lib/executiveCopilot/memoryStore";
import { buildExecutiveCopilotProvider } from "@/lib/executiveCopilot/provider";
import { isRateLimited } from "@/lib/executiveCopilot/rateLimit";

const PROVIDER_LABELS: Record<string, string> = { anthropic: "Claude", deepseek: "DeepSeek" };

export const runtime = "nodejs"; // provider SDKs (Anthropic, OpenAI) require Node, not Edge
export const dynamic = "force-dynamic"; // authenticated, per-user — never cache

// Last-resort safety net only — not the expected way a question ends. The user's own
// Stop button (which aborts the client fetch, which flows through as req.signal here) is
// now the primary way a long question gets cut short, so this exists purely to bound a
// truly stuck request that the user never interrupted themselves.
const REQUEST_TIMEOUT_MS = 180_000;

interface AskRequestBody {
  question: string;
  conversationHistory?: CopilotConversationTurn[];
  // From the model/effort selector in the UI — optional. Absent means "use this
  // environment's configured default," same as before the selector existed.
  provider?: string;
  effort?: string;
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  if (isRateLimited(token)) {
    return NextResponse.json(
      { error: "Too many questions in a short time — please wait a moment and try again." },
      { status: 429 },
    );
  }

  let body: AskRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.question || typeof body.question !== "string") {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  const provider = buildExecutiveCopilotProvider({ provider: body.provider, effort: body.effort });
  if (!provider) {
    if (body.provider) {
      // The admin explicitly picked a provider that isn't configured in this
      // environment — a recoverable, turn-level error (the other provider may still
      // work), not the whole-card "not configured" state.
      return NextResponse.json(
        { error: `${PROVIDER_LABELS[body.provider] || body.provider} isn't configured in this environment. Try switching models.` },
        { status: 400 },
      );
    }
    // Fails safe: no secret configured yet for the default provider in this
    // environment. The client renders a quiet "not yet configured" state rather than a
    // broken chat box.
    return NextResponse.json({ configured: false }, { status: 200 });
  }

  try {
    const memorySection = await formatMemoryForPrompt();
    const systemPromptPrefix = memorySection
      ? `${EXECUTIVE_COPILOT_SYSTEM_PROMPT_PREFIX}\n\n${memorySection}`
      : EXECUTIVE_COPILOT_SYSTEM_PROMPT_PREFIX;

    const result = await withTimeout(
      runCopilotAgent({
        provider,
        tools: EXECUTIVE_COPILOT_TOOLS,
        systemPromptPrefix,
        token,
        conversationHistory: body.conversationHistory ?? [],
        question: body.question,
        signal: req.signal,
      }),
      REQUEST_TIMEOUT_MS,
      "This is taking unusually long. Try narrowing the question and asking again.",
    );
    return NextResponse.json({
      configured: true,
      answer: result.answer,
      sources: result.sources,
      citations: result.citations,
    });
  } catch (err) {
    if (req.signal.aborted) {
      // Normal user action (Stop button, or navigating away) — not a failure, and the
      // client has already disconnected, so nothing actually reads this response.
      console.log("[executive-copilot] question cancelled by client");
      return NextResponse.json({ error: "Cancelled" }, { status: 499 });
    }
    console.error("[executive-copilot] ask route failed:", err);
    const message = err instanceof Error ? err.message : "The assistant is temporarily unavailable.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
