"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  summary?: ReactNode;
  containerStyle?: CSSProperties;
  controlsStyle?: CSSProperties;
  summaryStyle?: CSSProperties;
  buttonStyle?: CSSProperties;
  inputStyle?: CSSProperties;
  selectStyle?: CSSProperties;
  buttonClassName?: string;
};

const baseButtonStyle: CSSProperties = {
  padding: "8px 16px",
  fontSize: 13,
};

const baseInputStyle: CSSProperties = {
  width: 72,
  padding: "6px 10px",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  fontSize: 13,
  textAlign: "center",
};

const baseSelectStyle: CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  fontSize: 13,
  background: "#fff",
  color: "#0f172a",
};

export function PaginationControls({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions,
  summary,
  containerStyle,
  controlsStyle,
  summaryStyle,
  buttonStyle,
  inputStyle,
  selectStyle,
  buttonClassName,
}: PaginationControlsProps) {
  const [pageInput, setPageInput] = useState(String(page));
  const canChangePageSize =
    typeof pageSize === "number" && typeof onPageSizeChange === "function";

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  if (totalPages <= 1) {
    if (!summary && !canChangePageSize) return null;
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
          ...containerStyle,
        }}
      >
        {summary && (
          <span
            style={{
              fontSize: 13,
              color: "#64748b",
              ...summaryStyle,
            }}
          >
            {summary}
          </span>
        )}
        {canChangePageSize && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Rows
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
              style={{ ...baseSelectStyle, ...selectStyle }}
            >
              {(pageSizeOptions ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    );
  }

  const commitPage = () => {
    const parsed = parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) {
      setPageInput(String(page));
      return;
    }
    const nextPage = Math.min(totalPages, Math.max(1, parsed));
    setPageInput(String(nextPage));
    if (nextPage !== page) onPageChange(nextPage);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: summary ? "space-between" : "center",
        gap: 8,
        flexWrap: "wrap",
        ...containerStyle,
      }}
    >
      {summary && (
        <span
          style={{
            fontSize: 13,
            color: "#64748b",
            ...summaryStyle,
          }}
        >
          {summary}
        </span>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          ...controlsStyle,
        }}
      >
        {canChangePageSize && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Rows
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
              style={{ ...baseSelectStyle, ...selectStyle }}
            >
              {(pageSizeOptions ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className={buttonClassName}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          style={
            buttonClassName
              ? {
                  ...buttonStyle,
                  opacity: page === 1 ? 0.5 : 1,
                  cursor: page === 1 ? "not-allowed" : "pointer",
                }
              : {
                  ...baseButtonStyle,
                  ...buttonStyle,
                  opacity: page === 1 ? 0.5 : 1,
                  cursor: page === 1 ? "not-allowed" : "pointer",
                }
          }
        >
          ← Prev
        </button>
        <span style={{ fontSize: 13, color: "#64748b" }}>Page</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onBlur={commitPage}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitPage();
            }
          }}
          style={{ ...baseInputStyle, ...inputStyle }}
        />
        <span style={{ fontSize: 13, color: "#64748b" }}>of {totalPages}</span>
        <button
          type="button"
          className={buttonClassName}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          style={
            buttonClassName
              ? {
                  ...buttonStyle,
                  opacity: page === totalPages ? 0.5 : 1,
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                }
              : {
                  ...baseButtonStyle,
                  ...buttonStyle,
                  opacity: page === totalPages ? 0.5 : 1,
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                }
          }
        >
          Next →
        </button>
      </div>
    </div>
  );
}
