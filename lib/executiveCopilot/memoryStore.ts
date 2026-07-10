// Simple, isolated, file-based store for Executive Copilot's curated "lessons" memory.
//
// TEMPORARY STORAGE: deploy.ps1 rebuilds and wholesale-replaces this app's entire folder
// on every production deploy, so entries here do NOT survive a real deploy yet. This is a
// deliberate, agreed tradeoff — revisit with real persistence in the .NET backend's
// database once the memory feature has proven useful in practice. Until then this only
// reliably persists across dev-server restarts on the same machine.
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export interface CopilotMemoryEntry {
  id: string;
  content: string;
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "copilot-memories.json");
const MAX_ENTRIES_IN_PROMPT = 30; // soft cap so the system prompt can't grow unbounded

async function readAll(): Promise<CopilotMemoryEntry[]> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    return JSON.parse(raw) as CopilotMemoryEntry[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(entries: CopilotMemoryEntry[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export async function listMemories(): Promise<CopilotMemoryEntry[]> {
  const entries = await readAll();
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addMemory(content: string): Promise<CopilotMemoryEntry> {
  const entries = await readAll();
  const entry: CopilotMemoryEntry = {
    id: randomUUID(),
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };
  entries.push(entry);
  await writeAll(entries);
  return entry;
}

export async function deleteMemory(id: string): Promise<void> {
  const entries = await readAll();
  await writeAll(entries.filter((e) => e.id !== id));
}

// Formats current memory as a system-prompt section. Human-curated only — the copilot
// never writes to this store itself, so a bad entry can only get in if a human adds it.
export async function formatMemoryForPrompt(): Promise<string> {
  const entries = await listMemories();
  if (entries.length === 0) return "";
  const recent = entries.slice(0, MAX_ENTRIES_IN_PROMPT);
  const lines = recent.map((e) => `- ${e.content}`).join("\n");
  return `Lessons learned from prior corrections (curated by admins — treat these as authoritative guidance):\n${lines}`;
}
