"use client";

import { useEffect, useRef, useState } from "react";
import {
  bankTransactionsApi,
  type LinkCandidate,
  type LinkedEntityType,
} from "@/lib/api";

export function EntitySearchCombobox({
  entityType,
  onSelect,
  placeholder,
}: {
  entityType: LinkedEntityType;
  onSelect: (candidate: LinkCandidate) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<LinkCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await bankTransactionsApi.searchLinkCandidates(
          entityType,
          query || undefined,
        );
        if (res.success) setResults(res.data);
      } catch {
        /* ignore — leave previous results in place */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, entityType, open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        placeholder={placeholder ?? `Search by investor name or amount...`}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        style={{
          width: "100%",
          padding: "10px 14px",
          border: "1.5px solid #e2e8f0",
          borderRadius: 8,
          fontSize: 14,
          color: "#0f172a",
        }}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            width: "100%",
            maxHeight: 280,
            overflowY: "auto",
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
          }}
        >
          {loading && (
            <div style={{ padding: 12, fontSize: 13, color: "#64748b" }}>
              Searching…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div style={{ padding: 12, fontSize: 13, color: "#94a3b8" }}>
              No matches — try a different name or leave blank to browse recent
              records
            </div>
          )}
          {!loading &&
            results.map((r) => (
              <button
                key={`${r.entityType}-${r.entityId}`}
                type="button"
                onClick={() => {
                  onSelect(r);
                  setQuery(r.displayLabel);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  border: "none",
                  borderBottom: "1px solid #f1f5f9",
                  background: "white",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#0f172a",
                }}
              >
                {r.displayLabel}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
