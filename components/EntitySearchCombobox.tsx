"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  // The dropdown is portaled to <body> and positioned by fixed coordinates so it
  // can't be clipped by an ancestor with overflow:auto/hidden (e.g. the scrollable
  // transactions table) — recompute on open and whenever the page scrolls/resizes.
  useEffect(() => {
    if (!open) return;
    const updateRect = () => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, width: r.width });
    };
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

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
        placeholder={placeholder ?? `Search by investor name, or date (e.g. 05/07/26)...`}
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
      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: rect.top + 6,
              left: rect.left,
              zIndex: 1000,
              width: rect.width,
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
                No matches — try a different name/date or leave blank to browse
                recent records
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
          </div>,
          document.body,
        )}
    </div>
  );
}
