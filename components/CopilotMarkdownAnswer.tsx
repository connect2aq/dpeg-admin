"use client";
import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import type { CopilotCitation } from "@/lib/copilotEngine";
import { idFromCellText, findLabelMatches } from "@/lib/copilotCitationLinking";
import { parseChartSpec } from "@/lib/copilotChartSpec";
import CopilotChart from "./CopilotChart";

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
    th: ({ children, ...props }) => {
      // "App ID" cells are always short ("#42") — without a width hint the browser's
      // auto table layout still gives this column an even share of the row, leaving a
      // wide gap of unused space next to a two-character link. width:"1%" is the
      // standard shrink-to-fit hint: it makes this column take only what its content
      // needs, and the remaining space goes to columns that actually use it (names, etc).
      const isAppId = cellText(children).trim().toLowerCase() === "app id";
      return (
        <th
          style={{
            textAlign: "left",
            padding: "6px 10px",
            borderBottom: "2px solid #cbd5e1",
            color: "#0e3416",
            fontWeight: 700,
            whiteSpace: "nowrap",
            ...(isAppId ? { width: "1%" } : {}),
          }}
          {...props}
        >
          {children}
        </th>
      );
    },
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
    // A ```chart fenced block flows through copilotEngine.ts's post-processing untouched
    // (there's no markdown-native chart syntax to convert into, unlike ```table) and
    // arrives here exactly as the model wrote it -- react-markdown gives fenced code a
    // className of "language-<lang>" (no separate "inline" prop exists in this version),
    // so that's the signal used to intercept it. A spec that fails to parse falls through
    // to the same plain <code> rendering as any other language, rather than a blank or
    // crashed render -- the raw JSON stays visible and reportable.
    code: ({ className, children, ...props }) => {
      if (className?.includes("language-chart")) {
        const spec = parseChartSpec(String(children).replace(/\n$/, ""));
        if (spec) return <CopilotChart spec={spec} />;
      }
      return (
        <code style={{ background: "#f1f5f9", borderRadius: 4, padding: "1px 4px", fontSize: 12 }} className={className} {...props}>
          {children}
        </code>
      );
    },
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
