import { describe, it, expect } from "vitest";
import { citationsFromRecords, byIdField } from "./tools";

describe("byIdField", () => {
  it("returns the record's own numeric id", () => {
    expect(byIdField({ id: 42 })).toBe(42);
  });

  it("returns undefined when id is missing or not a number", () => {
    expect(byIdField({})).toBeUndefined();
    expect(byIdField({ id: "42" })).toBeUndefined();
    expect(byIdField({ id: null })).toBeUndefined();
  });
});

describe("citationsFromRecords", () => {
  const hrefFor = (id: number) => `/applications/${id}`;

  it("builds one citation per record using the given id/label extractors", () => {
    const records = [
      { id: 1, investorName: "Alice" },
      { id: 2, investorName: "Bob" },
    ];
    const citations = citationsFromRecords(records, "application", byIdField, hrefFor, (r) => r.investorName as string);
    expect(citations).toEqual([
      { type: "application", id: 1, label: "Alice", href: "/applications/1" },
      { type: "application", id: 2, label: "Bob", href: "/applications/2" },
    ]);
  });

  it("skips records where the id extractor can't find a numeric id", () => {
    const records = [{ id: 1, investorName: "Alice" }, { investorName: "No ID" }, { id: "not a number" }];
    const citations = citationsFromRecords(records, "application", byIdField, hrefFor, (r) => r.investorName as string);
    expect(citations).toHaveLength(1);
    expect(citations[0].id).toBe(1);
  });

  it("allows an undefined label rather than dropping the record", () => {
    const records = [{ id: 1 }];
    const citations = citationsFromRecords(records, "application", byIdField, hrefFor, (r) => r.investorName as string | undefined);
    expect(citations).toEqual([{ type: "application", id: 1, label: undefined, href: "/applications/1" }]);
  });

  it("uses a custom id extractor for records that reference their linkable id under a different field", () => {
    // Mirrors get_capital_ledger: each ledger entry references its investment via
    // applicationId, not its own id.
    const records = [{ id: 999, applicationId: 5, investorName: "Alice" }];
    const citations = citationsFromRecords(
      records,
      "application",
      (item) => (typeof item.applicationId === "number" ? item.applicationId : undefined),
      hrefFor,
      (r) => r.investorName as string,
    );
    expect(citations).toEqual([{ type: "application", id: 5, label: "Alice", href: "/applications/5" }]);
  });

  it("returns an empty array for non-array or empty input", () => {
    expect(citationsFromRecords(undefined, "application", byIdField, hrefFor, () => undefined)).toEqual([]);
    expect(citationsFromRecords(null, "application", byIdField, hrefFor, () => undefined)).toEqual([]);
    expect(citationsFromRecords("not an array", "application", byIdField, hrefFor, () => undefined)).toEqual([]);
    expect(citationsFromRecords([], "application", byIdField, hrefFor, () => undefined)).toEqual([]);
  });

  it("skips non-object entries in the records array", () => {
    const records = [{ id: 1, investorName: "Alice" }, null, "garbage", 42];
    const citations = citationsFromRecords(records, "application", byIdField, hrefFor, (r) => r.investorName as string);
    expect(citations).toHaveLength(1);
  });
});
