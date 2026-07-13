"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MultiFilterOption } from "@/lib/filterUtils";

export function MultiSelectFilter({
  options,
  selectedValues,
  onChange,
  allLabel,
  buttonLabel,
  minWidth = 180,
}: {
  options: MultiFilterOption[];
  selectedValues: string[];
  onChange: (next: string[]) => void;
  allLabel: string;
  buttonLabel?: string;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const selectedLabels = options
    .filter((option) => selectedSet.has(option.value))
    .map((option) => option.label);

  const toggleValue = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selectedValues.filter((item) => item !== value));
      return;
    }
    onChange([...selectedValues, value]);
  };

  const summary =
    selectedLabels.length === 0
      ? allLabel
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.length} selected`;

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", minWidth, flex: `1 1 ${minWidth}px` }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          width: "100%",
          padding: "10px 14px",
          border: "1.5px solid #e2e8f0",
          borderRadius: 8,
          fontSize: 14,
          background: "white",
          color: "#0f172a",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {buttonLabel ? `${buttonLabel}: ${summary}` : summary}
        </span>
        <span
          aria-hidden="true"
          style={{ color: "#64748b", fontSize: 12, flexShrink: 0 }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 20,
            width: "100%",
            maxHeight: 260,
            overflowY: "auto",
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
            padding: 8,
          }}
        >
          <button
            type="button"
            onClick={() => onChange([])}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              color: "#64748b",
              fontSize: 12,
              textAlign: "left",
              padding: "6px 8px 10px",
              cursor: "pointer",
            }}
          >
            Clear all
          </button>
          {options.map((option) => (
            <label
              key={option.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={selectedSet.has(option.value)}
                onChange={() => toggleValue(option.value)}
              />
              <span style={{ fontSize: 13, color: "#334155" }}>
                {option.label}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
