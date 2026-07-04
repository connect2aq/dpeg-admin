"use client";
import { useEffect, useRef, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import ExecutiveCopilotMemoryPanel from "@/components/ExecutiveCopilotMemoryPanel";
import CopilotMarkdownAnswer from "@/components/CopilotMarkdownAnswer";
import { friendlySourceLabels } from "@/lib/executiveCopilot/toolLabels";
import type { CopilotCitation } from "@/lib/copilotEngine";

interface Turn {
  question: string;
  answer?: string;
  sources?: string[];
  citations?: CopilotCitation[];
  loading: boolean;
  error?: string;
  stopped?: boolean;
}

// The Web Speech API isn't part of TypeScript's standard DOM lib (it's a non-standard,
// Chromium-led API), so these are minimal ambient shapes for just what's used here rather
// than a full type-definitions dependency for one small feature.
interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike {
  results: { [index: number]: { [index: number]: SpeechRecognitionResultLike } };
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const THINKING_PHRASES = [
  "Thinking…",
  "Checking the data…",
  "Cross-referencing records…",
  "Still working — this one needs a few lookups…",
];

// Persisted in localStorage (not sessionStorage, not keyed to the auth token) so the
// admin's model/effort choice survives logout/login and page reloads.
const STORAGE_PROVIDER_KEY = "executiveCopilotProvider";
const STORAGE_EFFORT_KEY = "executiveCopilotEffort";

interface ProviderStatus {
  id: string;
  label: string;
  configured: boolean;
  effortOptions: { value: string; label: string }[];
  defaultEffort: string;
  balanceText?: string;
  balanceLow?: boolean;
  balanceNote?: string;
}

async function fetchProviderStatuses(token: string): Promise<ProviderStatus[] | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/executive-copilot/providers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.providers ?? null;
  } catch {
    return null;
  }
}

// A pool of curated example questions spanning the domains the copilot can actually
// answer (cash, redemptions, DocuSign, distributions, pending approvals, audit trail,
// trends, capital ledger) — shown before the admin's first question to demonstrate the
// kind of open-ended question the tool handles, rather than leaving a blank input box to
// stare at.
const SAMPLE_QUESTION_POOL: string[] = [
  "How much cash do we have available today?",
  "Which redemptions are due this week but don't have a signed DocuSign yet?",
  "How does this month's distribution obligation compare to last month?",
  "What changed today across pending approvals?",
  "Which investor type has the highest redemption rate?",
  "How much interest did we pay on redemptions last month?",
  "Show me investors still waiting on DocuSign.",
  "Why did our cash position drop this month?",
  "What's pending approval right now, and how old is the oldest item?",
  "How many new investment applications came in this week?",
  "Which distributions are still unpaid this month?",
  "What does the audit log show for today?",
  "How does this month's capital raised compare to last month's?",
  "Which applications are still under review, and for how long?",
  "What's our total capital deployed versus redeemed so far?",
];

function pickRandomQuestions(count: number): string[] {
  const pool = [...SAMPLE_QUESTION_POOL];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

export default function ExecutiveCopilotCard() {
  const { token } = useAdminAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const [thinkingPhraseIndex, setThinkingPhraseIndex] = useState(0);
  // "preparing" covers the real gap between calling start() and the browser actually
  // being ready to capture audio — without this, the UI said "listening" immediately on
  // click and the first word or two spoken during that gap got dropped. "listening" only
  // begins once the browser's own onstart event fires, confirming it's truly ready,
  // rather than guessing at a fixed delay.
  const [voiceState, setVoiceState] = useState<"idle" | "preparing" | "listening">("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedEffort, setSelectedEffort] = useState("");
  // Deterministic placeholder on first render (matches server-rendered HTML, no hydration
  // mismatch); swapped for a genuinely random 3 once mounted client-side, in the same
  // mount effect below.
  const [sampleQuestions, setSampleQuestions] = useState<string[]>(() => SAMPLE_QUESTION_POOL.slice(0, 3));

  const isLoading = turns.some((t) => t.loading);

  const stopAsking = () => {
    abortControllerRef.current?.abort();
  };

  // Picks a fresh random 3 on every mount (i.e. every page load) so the suggestions
  // aren't the same each time — Math.random() can't run during the server-rendered pass
  // (it would produce different output than the client and trigger a hydration mismatch),
  // so this deliberately runs once, client-only, right after mount. Deferred via
  // queueMicrotask rather than called directly so the update isn't synchronous within the
  // effect body itself.
  useEffect(() => {
    queueMicrotask(() => setSampleQuestions(pickRandomQuestions(3)));
  }, []);

  // Loads provider config/balance once on mount and applies the admin's saved
  // provider/effort choice (falling back to whichever provider is actually configured if
  // the saved one no longer is). All setState calls here happen inside the .then()
  // callback, after the fetch has resolved — nothing is set synchronously in the effect
  // body itself.
  useEffect(() => {
    if (!token) return;
    let ignore = false;
    fetchProviderStatuses(token).then((list) => {
      if (ignore || !list) return;
      setProviders(list);

      const savedProvider = localStorage.getItem(STORAGE_PROVIDER_KEY);
      const savedEffort = localStorage.getItem(STORAGE_EFFORT_KEY);
      const savedProviderStillValid = savedProvider && list.some((p) => p.id === savedProvider && p.configured);
      const initialProvider = savedProviderStillValid ? savedProvider! : (list.find((p) => p.configured)?.id ?? "");
      const meta = list.find((p) => p.id === initialProvider);
      const savedEffortStillValid = savedEffort && meta?.effortOptions.some((o) => o.value === savedEffort);
      const initialEffort = savedEffortStillValid ? savedEffort! : (meta?.defaultEffort ?? "");

      setSelectedProvider(initialProvider);
      setSelectedEffort(initialEffort);
    });
    return () => {
      ignore = true;
    };
  }, [token]);

  const handleProviderChange = (value: string) => {
    setSelectedProvider(value);
    localStorage.setItem(STORAGE_PROVIDER_KEY, value);
    const meta = providers?.find((p) => p.id === value);
    const newEffort = meta?.defaultEffort ?? "";
    setSelectedEffort(newEffort);
    localStorage.setItem(STORAGE_EFFORT_KEY, newEffort);
  };

  const handleEffortChange = (value: string) => {
    setSelectedEffort(value);
    localStorage.setItem(STORAGE_EFFORT_KEY, value);
  };

  // Fills the input box with the transcription rather than auto-submitting — voice
  // recognition can mishear domain-specific names/terms, so the admin gets a chance to
  // see and correct the text before it's actually sent as a question. Checked at click
  // time (not pre-detected via an effect) so unsupported browsers just get a message
  // instead of needing client-only feature-detection state.
  const startListening = () => {
    type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
    const windowWithSpeech = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = windowWithSpeech.SpeechRecognition ?? windowWithSpeech.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceError("Voice input isn't supported in this browser — try Chrome or Edge.");
      return;
    }
    setVoiceError(null);
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setVoiceState("listening");
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setInput(transcript);
    };
    recognition.onerror = () => {
      setVoiceError("Couldn't hear that — please try again.");
      setVoiceState("idle");
    };
    recognition.onend = () => setVoiceState("idle");

    recognitionRef.current = recognition;
    setVoiceState("preparing");
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setVoiceState("idle");
  };

  // Cycles the "Thinking…" message so a multi-tool-call question (which can take a while)
  // doesn't look stuck. The interval callback is the only thing that calls setState here —
  // nothing is set synchronously in the effect body itself.
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setThinkingPhraseIndex((i) => (i + 1) % THINKING_PHRASES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isLoading]);

  const ask = async (questionOverride?: string) => {
    const question = (questionOverride ?? input).trim();
    if (!question || !token) return;
    setInput("");
    setTurns((t) => [...t, { question, loading: true }]);

    const conversationHistory = turns
      .filter((t) => t.answer)
      .flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer! },
      ]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/executive-copilot/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          question,
          conversationHistory,
          ...(selectedProvider ? { provider: selectedProvider } : {}),
          ...(selectedEffort ? { effort: selectedEffort } : {}),
        }),
        signal: controller.signal,
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
          ? { ...last, answer: data.answer, sources: data.sources, citations: data.citations, loading: false }
          : { ...last, error: data.error || "Something went wrong.", loading: false };
        return copy;
      });

      // The question just consumed API balance — refresh the figure shown in the
      // selector rather than leaving a stale number until the next page load.
      if (res.ok) {
        fetchProviderStatuses(token).then((list) => {
          if (list) setProviders(list);
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setTurns((t) => {
          const copy = [...t];
          copy[copy.length - 1] = { ...copy[copy.length - 1], stopped: true, loading: false };
          return copy;
        });
        return;
      }
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = { ...copy[copy.length - 1], error: "Network error — please try again.", loading: false };
        return copy;
      });
    } finally {
      abortControllerRef.current = null;
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

      {providers && providers.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <select
            value={selectedProvider}
            onChange={(e) => handleProviderChange(e.target.value)}
            style={{ fontSize: 12, padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 5, color: "#0e3416" }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.configured}>
                {p.label}
                {!p.configured ? " (not configured)" : ""}
              </option>
            ))}
          </select>
          <select
            value={selectedEffort}
            onChange={(e) => handleEffortChange(e.target.value)}
            style={{ fontSize: 12, padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 5, color: "#0e3416" }}
          >
            {providers
              .find((p) => p.id === selectedProvider)
              ?.effortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} effort
                </option>
              ))}
          </select>
          {(() => {
            const current = providers.find((p) => p.id === selectedProvider);
            if (!current) return null;
            if (current.balanceText) {
              return (
                <span style={{ fontSize: 11, color: current.balanceLow ? "#b91c1c" : "#94a3b8" }}>
                  Balance: {current.balanceText}
                </span>
              );
            }
            if (current.balanceNote) {
              return <span style={{ fontSize: 11, color: "#94a3b8" }}>{current.balanceNote}</span>;
            }
            return null;
          })()}
        </div>
      )}

      {turns.length === 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>Try asking:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sampleQuestions.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                style={{
                  textAlign: "left",
                  fontSize: 13,
                  padding: "6px 10px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  background: "#f8fafc",
                  color: "#0e3416",
                  cursor: "pointer",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

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
              {t.loading && (
                <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>
                  {THINKING_PHRASES[thinkingPhraseIndex]}
                </div>
              )}
              {t.answer && (
                <div style={{ marginTop: 4 }}>
                  <CopilotMarkdownAnswer text={t.answer} citations={t.citations} />
                </div>
              )}
              {t.error && <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 4 }}>{t.error}</div>}
              {t.stopped && <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>Stopped.</div>}
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
          placeholder={
            voiceState === "listening"
              ? "Listening — speak now…"
              : voiceState === "preparing"
                ? "Preparing microphone…"
                : "e.g. Why did our cash position drop this month?"
          }
          style={{ flex: 1, fontSize: 14, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 6, color: "#0e3416" }}
        />
        <button
          onClick={voiceState === "idle" ? startListening : stopListening}
          title={voiceState === "idle" ? "Ask by voice" : "Stop listening"}
          style={{
            fontSize: 15,
            padding: "8px 12px",
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            background: voiceState === "listening" ? "#fee2e2" : voiceState === "preparing" ? "#fef3c7" : "#fff",
            color: voiceState === "listening" ? "#b91c1c" : voiceState === "preparing" ? "#92400e" : "#64748b",
            cursor: "pointer",
          }}
        >
          {voiceState === "idle" ? "🎤" : voiceState === "preparing" ? "…" : "⏹"}
        </button>
        <button
          onClick={() => (isLoading ? stopAsking() : ask())}
          disabled={!isLoading && !input.trim()}
          style={{
            fontSize: 13,
            padding: "8px 16px",
            border: "none",
            borderRadius: 6,
            background: isLoading ? "#b91c1c" : input.trim() ? "#0e3416" : "#e2e8f0",
            color: isLoading || input.trim() ? "#fff" : "#94a3b8",
            cursor: isLoading || input.trim() ? "pointer" : "default",
            fontWeight: 600,
          }}
        >
          {isLoading ? "Stop" : "Ask"}
        </button>
      </div>
      {voiceError && <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>{voiceError}</div>}

      <ExecutiveCopilotMemoryPanel />
    </div>
  );
}
