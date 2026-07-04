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

interface LabelMatch {
  start: number;
  end: number;
  citation: CopilotCitation;
}

// Finds every occurrence of a known citation's label inside a cell's text — not just a
// whole-cell match — so a cell listing several records ("Alice ($50K), Bob ($100K)")
// still links each name individually instead of only linking when a cell is nothing but
// one record's name. Longest labels are matched first so a shorter label ("Akash Patel")
// can't pre-empt a match that should belong to a longer, more specific one. Overlapping
// matches are dropped in favor of whichever was found first (i.e. the longer label, given
// the sort order).
function findLabelMatches(text: string, citations: CopilotCitation[], labelUseCount: Map<string, number>): LabelMatch[] {
  const lowerText = text.toLowerCase();
  const byLabelLengthDesc = citations
    .filter((c): c is CopilotCitation & { label: string } => Boolean(c.label))
    .sort((a, b) => b.label.length - a.label.length);

  const seenLabels = new Set<string>();
  const matches: LabelMatch[] = [];

  for (const { label } of byLabelLengthDesc) {
    const lowerLabel = label.toLowerCase();
    if (seenLabels.has(lowerLabel)) continue; // already scanned all occurrences of this label
    seenLabels.add(lowerLabel);

    const sameLabelCitations = citations.filter((c) => c.label && c.label.toLowerCase() === lowerLabel);
    let searchFrom = 0;
    for (;;) {
      const idx = lowerText.indexOf(lowerLabel, searchFrom);
      if (idx === -1) break;
      const end = idx + lowerLabel.length;
      searchFrom = idx + 1;

      const overlaps = matches.some((m) => idx < m.end && end > m.start);
      if (overlaps) continue;

      // Two records for the same investor (e.g. two applications) share an identical
      // label — consume citations for that label in order, so the second occurrence in
      // the table links to the second citation, not always the first.
      const used = labelUseCount.get(lowerLabel) ?? 0;
      labelUseCount.set(lowerLabel, used + 1);
      matches.push({ start: idx, end, citation: sameLabelCitations[Math.min(used, sameLabelCitations.length - 1)] });
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}

function buildComponents(citations: CopilotCitation[]): Components {
  const labelUseCount = new Map<string, number>();

  // Renders a cell's plain text as-is, unless it contains one or more known records —
  // then each matched span becomes its own link, with everything else left as plain text.
  function renderCellContent(text: string, fallback: ReactNode): ReactNode {
    if (citations.length === 0 || !text.trim()) return fallback;

    const trimmed = text.trim();
    const id = idFromCellText(trimmed);
    if (id !== null) {
      const byId = citations.find((c) => Number(c.id) === id);
      if (byId) {
        return (
          <Link href={byId.href} target="_blank" rel="noopener noreferrer" style={{ color: "#699172", fontWeight: 600, textDecoration: "none" }}>
            {fallback} ↗
          </Link>
        );
      }
    }

    const matches = findLabelMatches(text, citations, labelUseCount);
    if (matches.length === 0) return fallback;

    const nodes: ReactNode[] = [];
    let cursor = 0;
    matches.forEach((m, i) => {
      if (m.start > cursor) nodes.push(text.slice(cursor, m.start));
      nodes.push(
        <Link
          key={`${m.citation.href}-${i}`}
          href={m.citation.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#699172", fontWeight: 600, textDecoration: "none" }}
        >
          {text.slice(m.start, m.end)} ↗
        </Link>,
      );
      cursor = m.end;
    });
    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
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
    td: ({ children, ...props }) => (
      <td style={{ padding: "6px 10px", borderBottom: "1px solid #e2e8f0", color: "#334155" }} {...props}>
        {renderCellContent(cellText(children), children)}
      </td>
    ),
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
