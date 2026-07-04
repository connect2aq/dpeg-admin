import { describe, it, expect } from "vitest";
import {
  citationsFromRecords,
  byIdField,
  stripSensitiveFields,
  stripSensitiveFieldsFromItems,
  EXECUTIVE_COPILOT_TOOLS,
} from "./tools";

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

describe("stripSensitiveFieldsFromItems", () => {
  it("strips the given fields from every item in a paginated result", () => {
    const result = {
      items: [
        { id: 1, investorName: "Alice", bankAccountNumber: "111", bankName: "Chase" },
        { id: 2, investorName: "Bob", bankAccountNumber: "222", bankName: "Wells Fargo" },
      ],
      totalCount: 2,
      page: 1,
      pageSize: 20,
    };
    const stripped = stripSensitiveFieldsFromItems(result, ["bankAccountNumber", "bankName"]) as {
      items: Record<string, unknown>[];
      totalCount: number;
    };
    expect(stripped.items).toEqual([
      { id: 1, investorName: "Alice" },
      { id: 2, investorName: "Bob" },
    ]);
    // Pagination metadata alongside items should be untouched.
    expect(stripped.totalCount).toBe(2);
  });

  it("actually strips the real audit-log payload fields", () => {
    // Regression guard for AdminAuditLogDTO's raw JSON blob fields.
    const result = {
      items: [
        {
          id: 1,
          eventType: "Admin.Application.StatusChanged",
          success: true,
          oldValuesJson: '{"status":"UnderReview"}',
          newValuesJson: '{"status":"Active"}',
          metadataJson: "{}",
        },
      ],
    };
    const stripped = stripSensitiveFieldsFromItems(result, ["oldValuesJson", "newValuesJson", "metadataJson"]) as {
      items: Record<string, unknown>[];
    };
    expect(stripped.items[0]).toEqual({ id: 1, eventType: "Admin.Application.StatusChanged", success: true });
  });

  it("actually strips the real distribution bank fields", () => {
    // Regression guard for AdminDistributionListDTO's bankName/bankAccountNumber.
    const result = {
      items: [
        {
          id: 5,
          investorName: "Alice",
          paymentStatus: "Paid",
          bankName: "Chase",
          bankAccountNumber: "000123456789",
        },
      ],
    };
    const stripped = stripSensitiveFieldsFromItems(result, ["bankName", "bankAccountNumber"]) as {
      items: Record<string, unknown>[];
    };
    expect(stripped.items[0]).toEqual({ id: 5, investorName: "Alice", paymentStatus: "Paid" });
  });

  it("passes through a result with no items array unchanged", () => {
    const result = { total: 5 };
    expect(stripSensitiveFieldsFromItems(result, ["x"])).toEqual({ total: 5 });
  });

  it("passes through non-object input unchanged", () => {
    expect(stripSensitiveFieldsFromItems(null, ["x"])).toBeNull();
    expect(stripSensitiveFieldsFromItems(undefined, ["x"])).toBeUndefined();
  });
});

// Guards against the exact bug this whole audit was triggered by: a tool that returns a
// list of records with a financial-account or raw-payload field slipping through
// unredacted. Every tool name here must have a corresponding entry in the map below
// naming which fields (if any) it strips -- forces a deliberate decision for every new
// tool rather than a silent gap.
describe("sensitive-field redaction coverage", () => {
  const KNOWN_SENSITIVE_TOOLS: Record<string, "redacts" | "no-sensitive-fields"> = {
    get_dashboard_stats: "no-sensitive-fields",
    get_dashboard_trends: "no-sensitive-fields",
    list_redemptions: "no-sensitive-fields", // AdminRedemptionListDTO has no bank fields -- only the Detail subclass does
    get_redemption_details: "redacts", // bankName/bankAccountHolderName/bankAccountNumber/bankRoutingNumber
    list_docusign_envelopes: "no-sensitive-fields",
    list_applications: "no-sensitive-fields",
    list_pending_changes: "no-sensitive-fields", // PendingChangeListDTO has no PayloadJson -- only the Detail subclass does
    get_pending_counts: "no-sensitive-fields",
    list_audit_logs: "redacts", // oldValuesJson/newValuesJson/metadataJson
    list_distributions: "redacts", // bankName/bankAccountNumber
    get_capital_ledger: "no-sensitive-fields",
    list_users: "no-sensitive-fields",
    get_bank_details: "no-sensitive-fields", // the FUND's own bank details -- this tool's entire purpose, not investor data
    get_daily_balances: "no-sensitive-fields",
  };

  it("has a documented redaction decision for every tool that currently exists", () => {
    const allNames = EXECUTIVE_COPILOT_TOOLS.map((t) => t.definition.name);
    const undocumented = allNames.filter((name) => !(name in KNOWN_SENSITIVE_TOOLS));
    expect(undocumented).toEqual([]);
  });

  it("doesn't document a tool that no longer exists", () => {
    const allNames = new Set(EXECUTIVE_COPILOT_TOOLS.map((t) => t.definition.name));
    const stale = Object.keys(KNOWN_SENSITIVE_TOOLS).filter((name) => !allNames.has(name));
    expect(stale).toEqual([]);
  });
});
