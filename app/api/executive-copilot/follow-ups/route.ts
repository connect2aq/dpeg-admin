import { NextRequest, NextResponse } from "next/server";
import { suggestFollowUps } from "@/lib/copilotEngine";
import { EXECUTIVE_COPILOT_FOLLOWUP_CONTEXT } from "@/lib/executiveCopilot/tools";
import { buildExecutiveCopilotProvider } from "@/lib/executiveCopilot/provider";
import { isRateLimited } from "@/lib/executiveCopilot/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FollowUpsRequestBody {
  question: string;
  answer: string;
  provider?: string;
  effort?: string;
}

// Separate, tool-free endpoint called by the client right after a main /ask response
// comes back — deliberately not folded into /ask itself, so the main answer isn't held up
// waiting on a second LLM round-trip just to generate suggestions.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  // Counts against the same per-token budget as /ask -- it's still a real (if cheap) LLM
  // call, not a free lookup.
  if (isRateLimited(token)) {
    return NextResponse.json({ followUps: [] }, { status: 200 });
  }

  let body: FollowUpsRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.question || !body.answer) {
    return NextResponse.json({ error: "Missing question or answer" }, { status: 400 });
  }

  const provider = buildExecutiveCopilotProvider({ provider: body.provider, effort: body.effort });
  if (!provider) {
    // Same fail-safe posture as /ask -- just no suggestions, not an error the user sees.
    return NextResponse.json({ followUps: [] }, { status: 200 });
  }

  const followUps = await suggestFollowUps({
    provider,
    systemPromptPrefix: EXECUTIVE_COPILOT_FOLLOWUP_CONTEXT,
    question: body.question,
    answer: body.answer,
    signal: req.signal,
  });

  return NextResponse.json({ followUps });
}
