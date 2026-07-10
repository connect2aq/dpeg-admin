import { NextRequest, NextResponse } from "next/server";
import { listMemories, addMemory } from "@/lib/executiveCopilot/memoryStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });

  const entries = await listMemories();
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.content || !body.content.trim()) {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }

  const entry = await addMemory(body.content);
  return NextResponse.json({ entry });
}
