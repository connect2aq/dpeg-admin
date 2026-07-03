"use client";
import { useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface MemoryEntry {
  id: string;
  content: string;
  createdAt: string;
}

export default function ExecutiveCopilotMemoryPanel() {
  const { token } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [newContent, setNewContent] = useState("");
  const [loading, setLoading] = useState(false);

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${basePath}/api/executive-copilot/memory`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setEntries(data.entries ?? []);
    } finally {
      setLoading(false);
    }
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  const add = async () => {
    const content = newContent.trim();
    if (!content || !token) return;
    setNewContent("");
    await fetch(`${basePath}/api/executive-copilot/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    });
    load();
  };

  const remove = async (id: string) => {
    if (!token) return;
    await fetch(`${basePath}/api/executive-copilot/memory/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  };

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
      <button
        onClick={toggleOpen}
        style={{ fontSize: 11, color: "#699172", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
      >
        {open ? "Hide" : "Manage"} memory{!open && entries.length > 0 ? ` (${entries.length})` : ""}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
            Lessons here are shown to the copilot on every question — use this to correct a wrong or missed
            answer permanently, without needing a code change.
          </p>

          {loading && <div style={{ fontSize: 12, color: "#94a3b8" }}>Loading…</div>}
          {!loading && entries.length === 0 && (
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>No memory entries yet.</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {entries.map((e) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  fontSize: 12,
                  color: "#334155",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "6px 10px",
                  gap: 8,
                }}
              >
                <span>{e.content}</span>
                <button
                  onClick={() => remove(e.id)}
                  style={{ fontSize: 11, color: "#b91c1c", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="e.g. For interest paid on redemptions, use get_dashboard_stats's redemptionInterestDateRange field."
              style={{ flex: 1, fontSize: 12, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6 }}
            />
            <button
              onClick={add}
              disabled={!newContent.trim()}
              style={{
                fontSize: 12,
                padding: "6px 12px",
                border: "none",
                borderRadius: 6,
                background: newContent.trim() ? "#0e3416" : "#e2e8f0",
                color: newContent.trim() ? "#fff" : "#94a3b8",
                cursor: newContent.trim() ? "pointer" : "default",
                fontWeight: 600,
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
