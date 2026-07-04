import { describe, it, expect } from "vitest";
import { citationsFromRecords, byIdField, stripSensitiveFields, EXECUTIVE_COPILOT_TOOLS } from "./tools";

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

// Guards against the exact class of bug this feature has repeatedly hit: a tool that
// returns individually-linkable records (applications, redemptions, ...) shipping with no
// extractCitations at all, so admins get a table full of names/IDs with zero links. This
// isn't about question phrasing -- citations are tied to which tools ran, not how the
// question was worded -- so the permanent fix is making "did we wire up citations for this
// tool" a build-time fact instead of something only discovered when a real user question
// stumbles onto the gap.
describe("EXECUTIVE_COPILOT_TOOLS citation coverage", () => {
  // Tools with genuinely no linkable per-record entity to cite (aggregates, counts,
  // reference data). Every tool NOT in this list must have extractCitations wired up --
  // adding tool #15 later without updating one of these two places is exactly the bug
  // this test exists to catch.
  const NO_CITATIONS_NEEDED = new Set([
    "get_dashboard_stats",
    "get_dashboard_trends",
    "get_pending_counts",
    "get_bank_details",
    "get_daily_balances",
  ]);

  it("has extractCitations wired up for every tool that isn't explicitly allowlisted", () => {
    const missing = EXECUTIVE_COPILOT_TOOLS.filter(
      (t) => !t.extractCitations && !NO_CITATIONS_NEEDED.has(t.definition.name),
    ).map((t) => t.definition.name);
    expect(missing).toEqual([]);
  });

  it("doesn't allowlist a tool that actually has extractCitations", () => {
    // Catches the allowlist going stale in the other direction -- a tool gaining
    // citations later but never being removed from the "doesn't need them" list.
    const withCitations = EXECUTIVE_COPILOT_TOOLS.filter((t) => t.extractCitations).map((t) => t.definition.name);
    const overlap = withCitations.filter((name) => NO_CITATIONS_NEEDED.has(name));
    expect(overlap).toEqual([]);
  });

  it("only allowlists tool names that actually exist", () => {
    const allNames = new Set(EXECUTIVE_COPILOT_TOOLS.map((t) => t.definition.name));
    const stale = [...NO_CITATIONS_NEEDED].filter((name) => !allNames.has(name));
    expect(stale).toEqual([]);
  });
});

describe("stripSensitiveFields", () => {
  it("removes the given fields from a record", () => {
    const record = { id: 1, investorName: "Alice", bankAccountNumber: "123456789", bankRoutingNumber: "987654321" };
    const result = stripSensitiveFields(record, ["bankAccountNumber", "bankRoutingNumber"]) as Record<string, unknown>;
    expect(result).toEqual({ id: 1, investorName: "Alice" });
    expect(result.bankAccountNumber).toBeUndefined();
    expect(result.bankRoutingNumber).toBeUndefined();
  });

  it("does not mutate the original record", () => {
    const record = { id: 1, bankAccountNumber: "123456789" };
    stripSensitiveFields(record, ["bankAccountNumber"]);
    expect(record.bankAccountNumber).toBe("123456789");
  });

  it("is a no-op for fields that aren't present", () => {
    const record = { id: 1, investorName: "Alice" };
    expect(stripSensitiveFields(record, ["bankAccountNumber"])).toEqual({ id: 1, investorName: "Alice" });
  });

  it("passes through non-object input unchanged", () => {
    expect(stripSensitiveFields(null, ["x"])).toBeNull();
    expect(stripSensitiveFields(undefined, ["x"])).toBeUndefined();
    expect(stripSensitiveFields("a string", ["x"])).toBe("a string");
    expect(stripSensitiveFields(42, ["x"])).toBe(42);
  });

  it("actually strips the redemption bank fields get_redemption_details returns", () => {
    // Regression guard for the real AdminRedemptionDetailDTO shape (bankName,
    // bankAccountHolderName, bankAccountNumber, bankRoutingNumber) -- this is what stops
    // an investor's real bank account/routing number from ever reaching the LLM.
    const redemptionDetail = {
      id: 34,
      investorName: "Apex Holding Strategies LP",
      docuSignStatus: "sent",
      bankName: "Chase",
      bankAccountHolderName: "Apex Holding Strategies LP",
      bankAccountNumber: "000123456789",
      bankRoutingNumber: "021000021",
    };
    const result = stripSensitiveFields(redemptionDetail, [
      "bankName",
      "bankAccountHolderName",
      "bankAccountNumber",
      "bankRoutingNumber",
    ]) as Record<string, unknown>;
    expect(result).toEqual({ id: 34, investorName: "Apex Holding Strategies LP", docuSignStatus: "sent" });
  });
});
