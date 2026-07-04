"use client";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Generic markdown renderer for copilot answers, reusable by any future copilot card.
// Styled to match this app's existing hand-rolled look (brand colors, small fonts) rather
// than pulling in a CSS framework. Tables get their own scroll container so a wide table
// can't blow out the card's layout on a narrow screen.
const components: Components = {
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
  td: ({ ...props }) => (
    <td style={{ padding: "6px 10px", borderBottom: "1px solid #e2e8f0", color: "#334155" }} {...props} />
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

export default function CopilotMarkdownAnswer({ text }: { text: string }) {
  return (
    <div style={{ color: "#334155", fontSize: 14 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
