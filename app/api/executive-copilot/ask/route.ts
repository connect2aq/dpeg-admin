import { NextRequest, NextResponse } from "next/server";
import { runCopilotAgent, type CopilotConversationTurn } from "@/lib/copilotEngine";
import { EXECUTIVE_COPILOT_TOOLS, EXECUTIVE_COPILOT_SYSTEM_PROMPT_PREFIX } from "@/lib/executiveCopilot/tools";
import { formatMemoryForPrompt } from "@/lib/executiveCopilot/memoryStore";
import { buildExecutiveCopilotProvider } from "@/lib/executiveCopilot/provider";

export const runtime = "nodejs"; // provider SDKs (Anthropic, OpenAI) require Node, not Edge
export const dynamic = "force-dynamic"; // authenticated, per-user — never cache

interface AskRequestBody {
  question: string;
  conversationHistory?: CopilotConversationTurn[];
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const provider = buildExecutiveCopilotProvider();
  if (!provider) {
    // Fails safe: no secret configured yet for the selected provider in this
    // environment. The client renders a quiet "not yet configured" state rather than a
    // broken chat box.
    return NextResponse.json({ configured: false }, { status: 200 });
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

  try {
    const memorySection = await formatMemoryForPrompt();
    const systemPromptPrefix = memorySection
      ? `${EXECUTIVE_COPILOT_SYSTEM_PROMPT_PREFIX}\n\n${memorySection}`
      : EXECUTIVE_COPILOT_SYSTEM_PROMPT_PREFIX;

    const result = await runCopilotAgent({
      provider,
      tools: EXECUTIVE_COPILOT_TOOLS,
      systemPromptPrefix,
      token,
      conversationHistory: body.conversationHistory ?? [],
      question: body.question,
    });
    return NextResponse.json({ configured: true, answer: result.answer, sources: result.sources });
  } catch (err) {
    console.error("[executive-copilot] ask route failed:", err);
    const message = err instanceof Error ? err.message : "The assistant is temporarily unavailable.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
