import { describe, it, expect } from "vitest";
import { idFromCellText, findLabelMatches } from "./copilotCitationLinking";
import type { CopilotCitation } from "./copilotEngine";

function citation(id: number, label: string, href = `/applications/${id}`): CopilotCitation {
  return { type: "application", id, label, href };
}

describe("idFromCellText", () => {
  it("does NOT match a bare, unmarked number", () => {
    // Regression guard for a real reported bug: a table cell showing "56" as a plain
    // count ("Number of distributions: 56") linked to an unrelated application #56,
    // because a bare number used to be treated as a valid id reference. A count/quantity
    // is indistinguishable from a real id by digits alone, so bare numbers must never match.
    expect(idFromCellText("56")).toBeNull();
    expect(idFromCellText("36")).toBeNull();
  });

  it("matches with a recognized prefix word", () => {
    expect(idFromCellText("ID 36")).toBe(36);
    expect(idFromCellText("Application #36")).toBe(36);
    expect(idFromCellText("Redemption 36")).toBe(36);
    expect(idFromCellText("User 36")).toBe(36);
  });

  it("matches a leading # with no word prefix", () => {
    expect(idFromCellText("#36")).toBe(36);
  });

  it("does not match a cell that isn't purely an ID reference", () => {
    // Regression guard: a loose match here would risk linking a dollar figure, a plain
    // count, or a date instead of a real record ID.
    expect(idFromCellText("$50,000")).toBeNull();
    expect(idFromCellText("36 investors")).toBeNull();
    expect(idFromCellText("Akash Patel")).toBeNull();
    expect(idFromCellText("56 distributions")).toBeNull();
    expect(idFromCellText("")).toBeNull();
  });
});

describe("findLabelMatches", () => {
  it("links a cell containing exactly one known record", () => {
    const citations = [citation(1, "Nazim Bandeali")];
    const matches = findLabelMatches("Nazim Bandeali", citations, new Map());
    expect(matches).toHaveLength(1);
    expect(matches[0].citation.id).toBe(1);
    expect(matches[0].start).toBe(0);
    expect(matches[0].end).toBe("Nazim Bandeali".length);
  });

  it("links every record mentioned in a cell that bundles several names together", () => {
    // This is the real bug report: "Salman Maknojia ($50K), Irina Stuart ($150K), Ali
    // Investments Group Inc ($100K)" previously got zero links because the old matcher
    // only handled a cell whose ENTIRE text was one record's name.
    const citations = [
      citation(1, "Salman Maknojia"),
      citation(2, "Irina Stuart"),
      citation(3, "Ali Investments Group Inc"),
    ];
    const text = "Salman Maknojia ($50K), Irina Stuart ($150K), Ali Investments Group Inc ($100K)";
    const matches = findLabelMatches(text, citations, new Map());
    expect(matches.map((m) => m.citation.id)).toEqual([1, 2, 3]);
    // Each match should point at exactly the name substring, not swallow the dollar figure
    matches.forEach((m) => {
      expect(text.slice(m.start, m.end).toLowerCase()).toBe(m.citation.label!.toLowerCase());
    });
  });

  it("matches a name even with a trailing disambiguating suffix the model added", () => {
    const citations = [citation(1, "Nazim Bandeali")];
    const matches = findLabelMatches("Nazim Bandeali (2nd application)", citations, new Map());
    expect(matches).toHaveLength(1);
    expect(matches[0].citation.id).toBe(1);
  });

  it("disambiguates two records sharing an identical label by consuming them in order", () => {
    // Same investor, two distinct applications (e.g. ShortTerm vs LongTerm) -- both
    // citations have the exact same label. The real bug this guards against: both
    // mentions in a table previously resolved to the SAME citation.
    const citations = [citation(101, "Akash Patel"), citation(102, "Akash Patel")];
    const labelUseCount = new Map<string, number>();

    const row1 = findLabelMatches("Akash Patel - ShortTerm ($500K)", citations, labelUseCount);
    const row2 = findLabelMatches("Akash Patel - LongTerm ($1M)", citations, labelUseCount);

    expect(row1[0].citation.id).toBe(101);
    expect(row2[0].citation.id).toBe(102);
  });

  it("finds two occurrences of the same label within a single cell in order", () => {
    const citations = [citation(101, "Akash Patel"), citation(102, "Akash Patel")];
    const text = "Akash Patel - ShortTerm ($500K), Akash Patel - LongTerm ($1M)";
    const matches = findLabelMatches(text, citations, new Map());
    expect(matches.map((m) => m.citation.id)).toEqual([101, 102]);
  });

  it("prefers a longer, more specific label over a shorter one it contains", () => {
    const citations = [citation(1, "Akash Patel"), citation(2, "Akash Patel Holdings LLC")];
    const matches = findLabelMatches("Akash Patel Holdings LLC", citations, new Map());
    // Should link the whole longer name to citation 2, not "Akash Patel" (citation 1)
    // followed by stray unlinked text.
    expect(matches).toHaveLength(1);
    expect(matches[0].citation.id).toBe(2);
  });

  it("returns no matches when nothing in the text is a known record", () => {
    const citations = [citation(1, "Nazim Bandeali")];
    expect(findLabelMatches("Some unrelated text", citations, new Map())).toHaveLength(0);
  });

  it("returns no matches when there are no citations at all", () => {
    expect(findLabelMatches("Nazim Bandeali", [], new Map())).toHaveLength(0);
  });

  it("ignores citations with no label", () => {
    const citations: CopilotCitation[] = [{ type: "application", id: 1, href: "/applications/1" }];
    expect(findLabelMatches("Nazim Bandeali", citations, new Map())).toHaveLength(0);
  });
});
