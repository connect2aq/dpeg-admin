"use client";
import { useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import ExecutiveCopilotMemoryPanel from "@/components/ExecutiveCopilotMemoryPanel";
import CopilotMarkdownAnswer from "@/components/CopilotMarkdownAnswer";
import { friendlySourceLabels } from "@/lib/executiveCopilot/toolLabels";

interface Turn {
  question: string;
  answer?: string;
  sources?: string[];
  loading: boolean;
  error?: string;
}

export default function ExecutiveCopilotCard() {
  const { token } = useAdminAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);

  const ask = async () => {
    const question = input.trim();
    if (!question || !token) return;
    setInput("");
    setTurns((t) => [...t, { question, loading: true }]);

    const conversationHistory = turns
      .filter((t) => t.answer)
      .flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer! },
      ]);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/executive-copilot/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question, conversationHistory }),
      });
      const data = await res.json();

      if (data.configured === false) {
        setNotConfigured(true);
        setTurns((t) => t.slice(0, -1));
        return;
      }

      setTurns((t) => {
        const copy = [...t];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = res.ok
          ? { ...last, answer: data.answer, sources: data.sources, loading: false }
          : { ...last, error: data.error || "Something went wrong.", loading: false };
        return copy;
      });
    } catch {
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = { ...copy[copy.length - 1], error: "Network error — please try again.", loading: false };
        return copy;
      });
    }
  };

  if (notConfigured) {
    return (
      <div className="card" style={{ marginBottom: 24, borderTop: "3px solid #94a3b8" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>
          Executive Copilot
        </div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>
          Not yet configured for this environment.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 24, borderTop: "3px solid #0e3416" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>
          Executive Copilot
        </div>
        {turns.length > 0 && (
          <button
            onClick={() => setTurns([])}
            style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}
          >
            Clear conversation
          </button>
        )}
      </div>

      {turns.length > 0 && (
        <div
          style={{
            maxHeight: 400,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginTop: 10,
            marginBottom: 12,
          }}
        >
          {turns.map((t, i) => (
            <div key={i}>
              <div style={{ fontWeight: 600, color: "#0e3416", fontSize: 14 }}>{t.question}</div>
              {t.loading && <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>Thinking…</div>}
              {t.answer && (
                <div style={{ marginTop: 4 }}>
                  <CopilotMarkdownAnswer text={t.answer} />
                </div>
              )}
              {t.error && <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 4 }}>{t.error}</div>}
              {t.sources && t.sources.length > 0 && (
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  Sources: {friendlySourceLabels(t.sources).join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="e.g. Why did our cash position drop this month?"
          style={{ flex: 1, fontSize: 14, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 6, color: "#0e3416" }}
        />
        <button
          onClick={ask}
          disabled={!input.trim()}
          style={{
            fontSize: 13,
            padding: "8px 16px",
            border: "none",
            borderRadius: 6,
            background: input.trim() ? "#0e3416" : "#e2e8f0",
            color: input.trim() ? "#fff" : "#94a3b8",
            cursor: input.trim() ? "pointer" : "default",
            fontWeight: 600,
          }}
        >
          Ask
        </button>
      </div>

      <ExecutiveCopilotMemoryPanel />
    </div>
  );
}
