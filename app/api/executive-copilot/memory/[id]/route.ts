import { NextRequest, NextResponse } from "next/server";
import { deleteMemory } from "@/lib/executiveCopilot/memoryStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });

  const { id } = await params;
  await deleteMemory(id);
  return NextResponse.json({ success: true });
}
