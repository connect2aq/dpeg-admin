// Pure text-matching logic behind CopilotMarkdownAnswer's inline table-cell links —
// extracted from the component so it can be unit tested without rendering React/markdown.
// Reusable by any future copilot's markdown renderer, same as lib/copilotEngine.ts.
import type { CopilotCitation } from "./copilotEngine";

// Only matches a cell whose ENTIRE trimmed text is an ID reference, and ONLY when it
// carries an explicit marker (a recognized word like "ID"/"Redemption"/"Application"/
// "User", or a leading "#") — a bare, unqualified number is NEVER treated as an ID
// reference, no matter how it's formatted. This is deliberate: a table can easily contain
// an unrelated bare number in the same shape as a real id (a count, a quantity, "56
// distributions this month") that happens to numerically collide with some other
// record's real id elsewhere in the same answer's citations — matching it would silently
// link to the wrong record. Requiring an explicit marker is what tells apart "this cell
// IS an id" from "this cell just happens to contain a number."
export function idFromCellText(text: string): number | null {
  const trimmed = text.trim();
  const wordPrefixed = trimmed.match(/^(?:id|redemption|application|user)\s*#?\s*(\d+)$/i);
  if (wordPrefixed) return parseInt(wordPrefixed[1], 10);
  const hashPrefixed = trimmed.match(/^#(\d+)$/);
  if (hashPrefixed) return parseInt(hashPrefixed[1], 10);
  return null;
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
