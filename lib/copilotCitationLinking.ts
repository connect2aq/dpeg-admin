// Pure text-matching logic behind CopilotMarkdownAnswer's inline table-cell links —
// extracted from the component so it can be unit tested without rendering React/markdown.
// Reusable by any future copilot's markdown renderer, same as lib/copilotEngine.ts.
import type { CopilotCitation } from "./copilotEngine";

// Only matches a cell whose ENTIRE trimmed text is an ID reference (optionally prefixed
// with a word like "ID"/"Redemption"/"#") — deliberately strict. A loose substring match
// against bare numbers would risk linking a dollar amount or date instead of a record ID.
export function idFromCellText(text: string): number | null {
  const stripped = text.replace(/^(id|redemption|application|user)\s*#?\s*/i, "").replace(/^#/, "").trim();
  return /^\d+$/.test(stripped) ? parseInt(stripped, 10) : null;
}

export interface LabelMatch {
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
//
// labelUseCount is shared across every cell in a table (passed in, not owned here) —
// two records for the same investor (e.g. two applications) share an identical label, so
// consuming citations for that label in table order is what makes the second occurrence
// of "Nazim Bandeali" link to the second citation rather than always the first.
export function findLabelMatches(
  text: string,
  citations: CopilotCitation[],
  labelUseCount: Map<string, number>,
): LabelMatch[] {
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

      const used = labelUseCount.get(lowerLabel) ?? 0;
      labelUseCount.set(lowerLabel, used + 1);
      matches.push({ start: idx, end, citation: sameLabelCitations[Math.min(used, sameLabelCitations.length - 1)] });
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}
