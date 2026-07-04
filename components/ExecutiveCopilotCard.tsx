"use client";
import { useEffect, useRef, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import ExecutiveCopilotMemoryPanel from "@/components/ExecutiveCopilotMemoryPanel";
import CopilotMarkdownAnswer from "@/components/CopilotMarkdownAnswer";
import { friendlySourceLabels } from "@/lib/executiveCopilot/toolLabels";
import { SAMPLE_QUESTION_POOL, pickNextQuestions } from "@/lib/executiveCopilot/sampleQuestions";
import type { CopilotCitation } from "@/lib/copilotEngine";

interface Turn {
  question: string;
  answer?: string;
  sources?: string[];
  citations?: CopilotCitation[];
  loading: boolean;
  error?: string;
  stopped?: boolean;
  followUps?: string[];
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
// Tracks which sample questions have already been shown so "More Ideas" cycles through
// the whole pool before repeating, rather than picking independently at random each time
// (which could show the same 3 again right away). Persisted the same way as the
// provider/effort choice -- across reloads, not tied to the auth token.
const STORAGE_SHOWN_QUESTIONS_KEY = "executiveCopilotShownQuestions";

function readShownQuestions(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_SHOWN_QUESTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [];
  } catch {
    return [];
  }
}

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

export default function ExecutiveCopilotCard() {
  const { token } = useAdminAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const [thinkingPhraseIndex, setThinkingPhraseIndex] = useState(0);
  // Transient per-turn "copied" feedback -- kept outside the Turn type since it's purely
  // a momentary UI state, not something worth persisting on the turn itself.
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  // "preparing" covers the real gap between calling start() and the browser actually
  // being ready to capture audio — without this, the UI said "listening" immediately on
  // click and the first word or two spoken during that gap got dropped. "listening" only
  // begins once the browser's own onstart event fires, confirming it's truly ready,
  // rather than guessing at a fixed delay.
  const [voiceState, setVoiceState] = useState<"idle" | "preparing" | "listening">("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const turnsContainerRef = useRef<HTMLDivElement | null>(null);

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

  const copyAnswer = async (index: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500);
    } catch {
      // Clipboard access can fail (permissions, non-secure context) -- not worth
      // surfacing an error for a convenience button.
    }
  };

  // Picks a fresh 3 on every mount (i.e. every page load), skipping whatever's already
  // been shown this cycle. Math.random() can't run during the server-rendered pass (it
  // would produce different output than the client and trigger a hydration mismatch), so
  // this deliberately runs once, client-only, right after mount. Deferred via
  // queueMicrotask rather than called directly so the update isn't synchronous within the
  // effect body itself.
  useEffect(() => {
    queueMicrotask(() => {
      const { picked, shown } = pickNextQuestions(readShownQuestions(), 3);
      setSampleQuestions(picked);
      localStorage.setItem(STORAGE_SHOWN_QUESTIONS_KEY, JSON.stringify(shown));
    });
  }, []);

  const refreshSampleQuestions = () => {
    const { picked, shown } = pickNextQuestions(readShownQuestions(), 3);
    setSampleQuestions(picked);
    localStorage.setItem(STORAGE_SHOWN_QUESTIONS_KEY, JSON.stringify(shown));
  };

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

  // Scrolls to the newest turn only when a NEW question is submitted (turns.length
  // growing) — otherwise clicking a sample/follow-up question appends it below the fold
  // of the scrollable list, so the admin has to manually scroll down just to confirm it
  // was submitted. Deliberately does NOT depend on the full `turns` array — re-scrolling
  // to the bottom every time the answer/follow-ups arrive would yank the view away from
  // the start of a long answer the admin is already reading. This is a plain DOM scroll,
  // not a setState call, so it's unrelated to the set-state-in-effect rule other effects
  // here have to work around.
  useEffect(() => {
    turnsContainerRef.current?.scrollTo({ top: turnsContainerRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  const ask = async (questionOverride?: string) => {
    const question = (questionOverride ?? input).trim();
    if (!question || !token) return;
    setInput("");
    const turnIndex = turns.length; // index this new turn will land at after the push below
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

        // Fire-and-forget: a separate, cheap LLM call to suggest follow-ups, run only
        // after the main answer is already back so it never adds to the wait for the
        // actual answer. Best-effort — if it fails or comes back empty, the turn simply
        // has no suggestions, not an error.
        fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/executive-copilot/follow-ups`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            question,
            answer: data.answer,
            ...(selectedProvider ? { provider: selectedProvider } : {}),
            ...(selectedEffort ? { effort: selectedEffort } : {}),
          }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (!Array.isArray(d.followUps) || d.followUps.length === 0) return;
            setTurns((t) => {
              if (!t[turnIndex]) return t;
              const copy = [...t];
              copy[turnIndex] = { ...copy[turnIndex], followUps: d.followUps };
              return copy;
            });
          })
          .catch(() => {
            // best-effort -- no suggestions is a fine fallback, not worth surfacing
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
        <div style={{ fontSize: 24, fontWeight: 700, color: "#0e3416" }}>
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
        <div style={{ fontSize: 24, fontWeight: 700, color: "#0e3416" }}>
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

      {turns.length > 0 && (
        <div
          ref={turnsContainerRef}
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
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: "#0e3416",
                    background: "#eaf3ec",
                    fontSize: 14,
                    padding: "6px 12px",
                    borderRadius: 10,
                    maxWidth: "85%",
                    textAlign: "right",
                  }}
                >
                  {t.question}
                </div>
              </div>
              {t.loading && (
                <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>
                  {THINKING_PHRASES[thinkingPhraseIndex]}
                </div>
              )}
              {t.answer && (
                <div style={{ marginTop: 4 }}>
                  <CopilotMarkdownAnswer text={t.answer} citations={t.citations} />
                  <button
                    onClick={() => copyAnswer(i, t.answer!)}
                    title="Copy response"
                    style={{
                      fontSize: 11,
                      color: "#94a3b8",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px 0",
                      marginTop: 2,
                    }}
                  >
                    {copiedIndex === i ? "✅ Copied" : "📋 Copy"}
                  </button>
                </div>
              )}
              {t.error && <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 4 }}>{t.error}</div>}
              {t.stopped && <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>Stopped.</div>}
              {t.sources && t.sources.length > 0 && (
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  Sources: {friendlySourceLabels(t.sources).join(", ")}
                </div>
              )}
              {t.followUps && t.followUps.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {t.followUps.map((q) => (
                    <button
                      key={q}
                      onClick={() => ask(q)}
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        border: "1px solid #cde3d3",
                        borderRadius: 14,
                        background: "#f1f8f3",
                        color: "#0e3416",
                        cursor: "pointer",
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Try asking:</div>
          <button
            onClick={refreshSampleQuestions}
            style={{ fontSize: 11, color: "#699172", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
          >
            More Ideas
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                : ""
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
