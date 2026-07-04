"use client";
import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import type { CopilotCitation } from "@/lib/copilotEngine";

// Generic markdown renderer for copilot answers, reusable by any future copilot card.
// Styled to match this app's existing hand-rolled look (brand colors, small fonts) rather
// than pulling in a CSS framework. Tables get their own scroll container so a wide table
// can't blow out the card's layout on a narrow screen.

// Flattens a cell's rendered React children back into plain text, so we can match it
// against known citations (e.g. "ID 36" or "Lirani Investments LLC").
function cellText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement(child)) {
        const props = child.props as { children?: ReactNode };
        return cellText(props.children);
      }
      return "";
    })
    .join("");
}

// Only matches a cell whose ENTIRE trimmed text is an ID reference (optionally prefixed
// with a word like "ID"/"Redemption"/"#") — deliberately strict. A loose substring match
// against bare numbers would risk linking a dollar amount or date instead of a record ID.
function idFromCellText(text: string): number | null {
  const stripped = text.replace(/^(id|redemption|application|user)\s*#?\s*/i, "").replace(/^#/, "").trim();
  return /^\d+$/.test(stripped) ? parseInt(stripped, 10) : null;
}

// Strips a trailing disambiguating suffix the model adds when the same investor has
// multiple records in one table — "(2nd application)", "(id 104)", "(LongTerm)", etc. —
// so the remaining text can still match that investor's label.
function stripDisambiguatingSuffix(text: string): string {
  return text.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function buildComponents(citations: CopilotCitation[]): Components {
  // Tracks how many cells have already matched a given label. Two records for the same
  // investor (e.g. two applications) produce two citations with an IDENTICAL label — a
  // plain find-by-label would always return the first one. Consuming citations in order
  // per label means the second occurrence of "Nazim Bandeali" in a table links to the
  // second citation, not the first, as long as the table lists them in the same order
  // extractCitations did (the order the backend returned them in) — true in practice,
  // not guaranteed, but far better than always picking the first.
  const labelUseCount = new Map<string, number>();

  function findCitationForCell(text: string): CopilotCitation | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;

    const id = idFromCellText(trimmed);
    if (id !== null) {
      const byId = citations.find((c) => Number(c.id) === id);
      if (byId) return byId;
    }

    const key = stripDisambiguatingSuffix(trimmed).toLowerCase();
    if (!key) return undefined;
    const candidates = citations.filter((c) => c.label && c.label.toLowerCase() === key);
    if (candidates.length === 0) return undefined;

    const used = labelUseCount.get(key) ?? 0;
    labelUseCount.set(key, used + 1);
    return candidates[Math.min(used, candidates.length - 1)];
  }

  return {
    table: ({ ...props }) => (
      <div style={{ overflowX: "auto", marginTop: 8, marginBottom: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }} {...props} />
      </div>
    ),
    thead: ({ ...props }) => <thead style={{ background: "#f8fafc" }} {...props} />,
    th: ({ ...props }) => (
      <th
        style={{
          textAlign: "left",
          padding: "6px 10px",
          borderBottom: "2px solid #cbd5e1",
          color: "#0e3416",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
        {...props}
      />
    ),
    td: ({ children, ...props }) => {
      const match = citations.length > 0 ? findCitationForCell(cellText(children)) : undefined;
      return (
        <td style={{ padding: "6px 10px", borderBottom: "1px solid #e2e8f0", color: "#334155" }} {...props}>
          {match ? (
            <Link
              href={match.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#699172", fontWeight: 600, textDecoration: "none" }}
            >
              {children} ↗
            </Link>
          ) : (
            children
          )}
        </td>
      );
    },
    h1: ({ ...props }) => <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0e3416", margin: "10px 0 4px" }} {...props} />,
    h2: ({ ...props }) => <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0e3416", margin: "10px 0 4px" }} {...props} />,
    h3: ({ ...props }) => <h3 style={{ fontSize: 13, fontWeight: 700, color: "#0e3416", margin: "10px 0 4px" }} {...props} />,
    strong: ({ ...props }) => <strong style={{ color: "#0e3416" }} {...props} />,
    p: ({ ...props }) => <p style={{ margin: "4px 0" }} {...props} />,
    ul: ({ ...props }) => <ul style={{ margin: "4px 0", paddingLeft: 20 }} {...props} />,
    ol: ({ ...props }) => <ol style={{ margin: "4px 0", paddingLeft: 20 }} {...props} />,
    li: ({ ...props }) => <li style={{ marginBottom: 2 }} {...props} />,
    a: ({ ...props }) => <a style={{ color: "#699172" }} {...props} />,
    code: ({ ...props }) => (
      <code style={{ background: "#f1f5f9", borderRadius: 4, padding: "1px 4px", fontSize: 12 }} {...props} />
    ),
  };
}

export default function CopilotMarkdownAnswer({ text, citations = [] }: { text: string; citations?: CopilotCitation[] }) {
  return (
    <div style={{ color: "#334155", fontSize: 14 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildComponents(citations)}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
