// Executive-Copilot-specific tool definitions. This file is the single choke point for
// the read-only guarantee: it only ever imports GET-style path builders from
// lib/apiContracts.ts and never any mutation function from lib/api.ts. If this file is
// ever touched again, re-verify that no mutation-wrapping tool has been added.
import type { CopilotCitation, CopilotTool } from "@/lib/copilotEngine";
import {
  dashboardPath,
  dashboardTrendsPath,
  redemptionsPath,
  redemptionPath,
  docuSignEnvelopesPath,
  applicationsPath,
  pendingChangesPath,
  pendingCountsPath,
  auditLogsPath,
  distributionsPath,
  capitalLedgerPath,
  usersPath,
  bankDetailsPath,
  dailyBalancesPath,
} from "@/lib/apiContracts";

const BASE = process.env.NEXT_PUBLIC_API_URL;
const MAX_REDEMPTION_DETAIL_IDS = 20;
// This used to be 20 -- the admin portal UI's own page size -- which silently truncated
// analytical answers: a real reported bug asked "which distributions are unpaid", got
// back page 1 (20 of ~114 records for the month, all coincidentally Paid), and concluded
// "none are unpaid" without ever looking at the other 5 pages where the actual unpaid
// ones were. A UI pagination default has nothing to do with what the model needs to see
// to answer completely, so this is now large enough to capture a full month/dataset for
// this fund's current size in one call for most tools. This is a mitigation, not a
// guarantee for a much larger fund later -- see the "check totalPages" rule in
// EXECUTIVE_COPILOT_SYSTEM_PROMPT_PREFIX, which is the actual backstop.
const DEFAULT_PAGE_SIZE = 150;
const BACKEND_FETCH_TIMEOUT_MS = 15_000; // bounds a single hung backend call
const CAPITAL_LEDGER_DEFAULT_WINDOW_DAYS = 90; // see get_capital_ledger below -- this endpoint has no pagination

async function backendGet<T>(path: string, token: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Backend request to ${path} failed with HTTP ${res.status}`);
    const json = (await res.json()) as { success: boolean; data: T; message: string };
    if (!json.success) throw new Error(json.message || `Backend call to ${path} was unsuccessful`);
    return json.data;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Backend request to ${path} timed out after ${BACKEND_FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Pulls linkable records (id + label + href) out of a tool result for the "referenced
// records" UI — only meaningful for entities with a real admin detail page (redemptions,
// applications, users). Loosely typed on purpose: this file deliberately doesn't import
// lib/api.ts's types (see the isolation note at the top of this file), so extraction is a
// safe runtime shape check rather than a static type dependency. idFor is a function, not
// a fixed "id" field name, because some records (e.g. capital ledger entries) reference
// the linkable ID under a different field (applicationId), not their own id.
export function citationsFromRecords(
  records: unknown,
  type: string,
  idFor: (item: Record<string, unknown>) => number | undefined,
  hrefFor: (id: number) => string,
  labelFor: (item: Record<string, unknown>) => string | undefined,
  // Optional: for an "investor" citation whose underlying record also has its own
  // application detail page, resolves that application's id so ensureSecondaryIdColumn
  // (copilotEngine.ts) can guarantee a correct "App ID" column from trusted tool data
  // alone -- it never has to trust the model to type one out, get it right, or even
  // remember to include the column at all.
  applicationIdFor?: (item: Record<string, unknown>) => number | undefined,
): CopilotCitation[] {
  if (!Array.isArray(records)) return [];
  return records
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({ item, id: idFor(item) }))
    .filter((x): x is { item: Record<string, unknown>; id: number } => typeof x.id === "number")
    .map(({ item, id }) => {
      const applicationId = applicationIdFor?.(item);
      return {
        type,
        id,
        label: labelFor(item),
        href: hrefFor(id),
        ...(typeof applicationId === "number"
          ? { secondaryId: applicationId, secondaryColumnHeader: "App ID", secondaryCellPrefix: "#" }
          : {}),
      };
    });
}

// The common case: the record's own "id" field is the linkable ID.
export function byIdField(item: Record<string, unknown>): number | undefined {
  return typeof item.id === "number" ? item.id : undefined;
}

// AdminRedemptionDetailDTO includes the investor's real bank account/routing number
// ("Bank details from linked investment tranche" per AdminDTOs.cs) alongside the
// DocuSign/status fields get_redemption_details actually exists for. Those payment
// details are never needed to answer a DocuSign-status or redemption-timing question, so
// they're stripped here -- before the result becomes part of what's sent to the LLM
// provider -- rather than just trusting the model not to repeat them.
const REDEMPTION_BANK_DETAIL_FIELDS = ["bankName", "bankAccountHolderName", "bankAccountNumber", "bankRoutingNumber"] as const;

export function stripSensitiveFields(record: unknown, fields: readonly string[]): unknown {
  if (typeof record !== "object" || record === null) return record;
  const copy = { ...(record as Record<string, unknown>) };
  for (const field of fields) delete copy[field];
  return copy;
}

// Same as stripSensitiveFields, but for a paginated { items: [...] } result -- the shape
// every list_* tool built on withPageDefaults returns.
export function stripSensitiveFieldsFromItems(result: unknown, fields: readonly string[]): unknown {
  if (typeof result !== "object" || result === null) return result;
  const obj = result as Record<string, unknown>;
  if (!Array.isArray(obj.items)) return result;
  return { ...obj, items: obj.items.map((item) => stripSensitiveFields(item, fields)) };
}

// AdminDistributionListDTO includes the investor's real bank name and account number
// alongside the payment-status fields list_distributions actually exists for -- never
// needed to answer "which distributions are paid/unpaid" questions.
const DISTRIBUTION_BANK_DETAIL_FIELDS = ["bankName", "bankAccountNumber"] as const;

// AdminAuditLogDTO's OldValuesJson/NewValuesJson/MetadataJson are arbitrary serialized
// blobs of whatever an admin action changed -- the backend already redacts the highest-
// severity fields (SSN, driving license, bank account/routing number) at the point these
// get written (see FormService.cs), but that's a guarantee about today's write paths, not
// something this tool can verify going forward. Since list_audit_logs's stated purpose
// (who did what, when, success/failure) doesn't need the raw before/after payload, these
// are stripped unconditionally rather than trusting every current and future caller of
// _audit.LogAsync to keep redacting consistently.
const AUDIT_LOG_RAW_PAYLOAD_FIELDS = ["oldValuesJson", "newValuesJson", "metadataJson"] as const;

function withPageDefaults(params: Record<string, unknown> = {}): Record<string, string | number> {
  const merged: Record<string, string | number> = { page: 1, pageSize: DEFAULT_PAGE_SIZE };
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") merged[k] = v as string | number;
  }
  return merged;
}

export const EXECUTIVE_COPILOT_SYSTEM_PROMPT_PREFIX = `
You are Executive Copilot for the DPEG Real Estate Fund admin portal. You help fund administrators analyze cash position, redemptions, distributions, DocuSign status, pending approvals, applications, and the audit log by calling the tools available to you.

Available tools and what they cover:
- get_dashboard_stats / get_dashboard_trends: fund-wide cash and capital figures (bank balance, deployed amount, capital raised/redeemed/distributed), and monthly trend series (applications, investor mix, deposits).
- list_redemptions / get_redemption_details: redemption records. list_redemptions does NOT include DocuSign status — for questions about redemptions and signatures together, first narrow with list_redemptions, then call get_redemption_details with the resulting IDs (max 20 at a time).
- list_docusign_envelopes: DocuSign envelope status for both applications and redemptions.
- list_applications: investment application records and their review status.
- list_pending_changes / get_pending_counts: the maker-checker-approver queue (pending Investment/Redemption/Distribution changes awaiting review).
- list_audit_logs: the admin action audit trail (who did what, when, success/failure).
- list_distributions: monthly distribution records and payment status.
- get_capital_ledger: chronological capital-flow ledger (contributions, redemptions, distributions).
- list_users: registered investor/user accounts.
- get_bank_details / get_daily_balances: bank account reference details and the manually-entered daily balance log.

Use list/get tools to narrow before fetching details on a large set. If a question needs data no tool here provides (e.g. something not in this list), say so rather than guessing.

Pagination rule — every list_* tool result includes totalCount, page, pageSize, and totalPages. Before stating or implying a complete/exhaustive answer ("all X are paid", "there are no unpaid Y", "here are all N records", any count or "none of them..." claim), check totalPages. If totalPages is more than 1, you have NOT seen the whole dataset yet — you MUST either fetch the remaining pages (same filters, page incremented) or re-call with a larger pageSize, and only make the exhaustive claim once every page has actually been read. Never conclude an exhaustive claim from page 1 alone just because it happened to look consistent (e.g. every record on page 1 being Paid does NOT mean none elsewhere are unpaid).

Formatting rule for tables: when a table lists individual applications, redemptions, investors, or other records the admin might want to open, give each record its own row and its own cell containing that record's name — never combine multiple records' names into one comma-separated cell (e.g. one date or one status having several applications), and never collapse repeat entries into a "(x2)"-style count. One row per record is what lets the UI turn each one into a clickable link back to that record. When a table lists application records specifically, include an "App ID" column with the id written as "#42" (a leading # followed by the number, nothing else in that cell) — this is what lets the UI link that specific application, separately from the investor name linking to that investor's overall statement. Never write a bare, unmarked number like "42" alone in a cell for this purpose — the UI only treats "#42"-style (or "ID 42"-style) references as a linkable id; an unmarked number is assumed to be a plain count or quantity, not a record reference.

When presenting more than one row of parallel data (a ranked list, several records, a comparison), do not hand-write a markdown pipe table. Instead, emit a fenced code block labeled exactly "table" containing JSON shaped like {"columns": ["Rank", "Investor", "Total Invested"], "rows": [{"Rank": "1", "Investor": "3DXB LLC", "Total Invested": "$3,200,000"}, {"Rank": "2", "Investor": "Nathani Family Investments, LLC", "Total Invested": "$1,800,000"}]} — every row object must use the exact same column-header strings as its keys, and every row must include a value for every column (use "" if something genuinely doesn't apply, e.g. no rank medal for a row). This is rendered into a real table automatically. Naming each row's values by column, rather than writing them positionally, is what prevents a column silently drifting out of alignment partway down a long table (e.g. folding a rank medal into the name cell for the top 3 rows, then switching to a separate bare rank cell for the rest).

A blank table cell is never acceptable when the tool result actually contains that field for that record (e.g. effectiveDate, distributionMonth, submittedAt) — go back to the tool result and use the real value. If some rows in a table were sourced from a call that genuinely doesn't return a given field at all, don't include that column for those rows with blanks; either fetch the tool call that has it before answering, or drop the column from that table entirely. A column full of real values with a few silent blanks reads as a data bug to the admin, not an intentional omission. This drop-the-column allowance does NOT apply to "App ID" specifically — always include it for application-record tables per the rule above, even if you're unsure of the exact value, since the UI cross-checks and corrects that specific column from the underlying data regardless of what you write there.
`.trim();

// Short domain context for the tool-free follow-up-suggestion call (see
// suggestFollowUps in lib/copilotEngine.ts) — deliberately NOT the full tool-by-tool
// prompt above, since that call never invokes a tool and reciting all 14 tool
// descriptions would just be wasted tokens on every question.
export const EXECUTIVE_COPILOT_FOLLOWUP_CONTEXT =
  "You help a fund administrator at the DPEG Real Estate Fund explore data on cash position, redemptions, distributions, DocuSign status, applications, pending approvals, the capital ledger, and investor accounts.";

export const EXECUTIVE_COPILOT_TOOLS: CopilotTool[] = [
  {
    definition: {
      name: "get_dashboard_stats",
      description:
        "Get current fund-wide cash and capital figures: bank account balance, deployed amount, total capital raised/redeemed/distributed, pending review/redemption counts. Response fields include redemptionInterestCommencement (all-time) and redemptionInterestDateRange (scoped to the from/to you pass) — this is specifically the interest/preferred-return component paid to investors AT REDEMPTION (exit), separate from monthlyDistributionsCommencement/monthlyDistributionsDateRange which is ongoing monthly distributions. For 'interest paid on redemptions' questions, this field is the authoritative source — do not try to derive it from raw redemption or capital-ledger records. For a month-by-month breakdown, call this tool once per month with from/to set to that month's start/end and read redemptionInterestDateRange each time. For 'how many active investors' questions, activeInvestors is the authoritative count (a distinct investor with a currently-active investment) — do not substitute an application count or a user count instead, since one investor can hold multiple applications/investments. The response also includes totalUsers, neverApplied, awaitingApproval, and latestRejected (recruitment-funnel/registration metrics) — these are deliberately hidden from the CEO-facing dashboard and are NOT of interest to the CEO, so never surface them in an answer unless the question is specifically about registration/onboarding funnel counts. IMPORTANT field-naming trap: despite the name, totalDeployedCommencement/totalDepositedDateRange is NOT capital deployed into investments — it is total capital RAISED/deposited BY investors since inception (shown on the dashboard as 'Total Deposits to Date' / 'Capital Raised'). Likewise totalWithdrawnCommencement/totalWithdrawnDateRange means total capital REDEEMED (paid back to investors), not a bank withdrawal. The actual capital deployed into investments/properties is the separate, manually-entered deployedAmount field (shown on the dashboard as 'Deployed', under Balance Flow) — for any 'capital deployed' question, use deployedAmount, never totalDeployedCommencement, and be explicit in the answer that 'capital raised' and 'capital deployed' are two different figures (raised money can sit undeployed as cash).",
      input_schema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Optional ISO date, start of range" },
          to: { type: "string", description: "Optional ISO date, end of range" },
        },
      },
    },
    execute: (input, token) => {
      const p = (input ?? {}) as { from?: string; to?: string };
      return backendGet(dashboardPath(p), token);
    },
  },
  {
    definition: {
      name: "get_dashboard_trends",
      description:
        "Get monthly trend series: applications submitted/approved per month, investor type breakdown, monthly capital deployed. Call this for trend or month-over-month comparison questions.",
      input_schema: { type: "object", properties: {} },
    },
    execute: (_input, token) => backendGet(dashboardTrendsPath(), token),
  },
  {
    definition: {
      name: "list_redemptions",
      description:
        "List redemption records, optionally filtered by status ('UnderReview'|'Active'|'Rejected'|'Redeemed'). Does NOT include DocuSign signature status — use get_redemption_details for that. Call this for questions about redemptions due, pending, or by status. There is no server-side filter for investor type -- each returned record has its own investorType field, so filter for that yourself after fetching, not via a request parameter.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", description: "UnderReview | Active | Rejected | Redeemed" },
          page: { type: "number" },
          pageSize: { type: "number" },
        },
      },
    },
    execute: (input, token) => {
      const p = withPageDefaults(input as Record<string, unknown>);
      return backendGet(redemptionsPath(p), token);
    },
    extractCitations: (result) =>
      citationsFromRecords(
        (result as { items?: unknown[] })?.items,
        "redemption",
        byIdField,
        (id) => `/redemptions/${id}`,
        (r) => (r.sellingPartnerName as string) || (r.email as string),
      ),
  },
  {
    definition: {
      name: "get_redemption_details",
      description:
        "Get full detail (including DocuSign signature status) for up to 20 specific redemption IDs. Use this after list_redemptions to check signature status on a narrowed set of candidates — e.g. 'which redemptions due this week lack a signed DocuSign'.",
      input_schema: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "number" }, description: "Redemption IDs, max 20" },
        },
        required: ["ids"],
      },
    },
    execute: async (input, token) => {
      const { ids } = input as { ids: number[] };
      const capped = (ids ?? []).slice(0, MAX_REDEMPTION_DETAIL_IDS);
      const results = await Promise.all(capped.map((id) => backendGet(redemptionPath(id), token)));
      return {
        results: results.map((r) => stripSensitiveFields(r, REDEMPTION_BANK_DETAIL_FIELDS)),
        truncated: (ids ?? []).length > MAX_REDEMPTION_DETAIL_IDS,
      };
    },
    extractCitations: (result) =>
      citationsFromRecords(
        (result as { results?: unknown[] })?.results,
        "redemption",
        byIdField,
        (id) => `/redemptions/${id}`,
        (r) => (r.sellingPartnerName as string) || (r.email as string),
      ),
  },
  {
    definition: {
      name: "list_docusign_envelopes",
      description:
        "List all DocuSign envelopes (for both applications and redemptions) with signature status. Call this for questions about who's awaiting a signature or DocuSign completion status.",
      input_schema: { type: "object", properties: {} },
    },
    execute: (_input, token) => backendGet(docuSignEnvelopesPath(), token),
    // Each entry's `applicationId` field is overloaded depending on recordType — verified
    // against AdminRepository.GetApplicationsWithEnvelopesAsync: for an "Application" row
    // it's the application's own id, but for a "Redemption" row it's set to the
    // RedemptionForm's own id (ApplicationId = r.Id), NOT the parent investment
    // application. Splitting by recordType before building citations is what makes this
    // safe -- previously this tool had no extractCitations at all because of that
    // ambiguity.
    extractCitations: (result) => {
      const items = Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
      const idFromApplicationIdField = (item: Record<string, unknown>) =>
        typeof item.applicationId === "number" ? item.applicationId : undefined;
      const labelFor = (r: Record<string, unknown>) => r.investorName as string;
      return [
        ...citationsFromRecords(
          items.filter((r) => r.recordType === "Application"),
          "application",
          idFromApplicationIdField,
          (id) => `/applications/${id}`,
          labelFor,
        ),
        ...citationsFromRecords(
          items.filter((r) => r.recordType === "Redemption"),
          "redemption",
          idFromApplicationIdField,
          (id) => `/redemptions/${id}`,
          labelFor,
        ),
      ];
    },
  },
  {
    definition: {
      name: "list_applications",
      description:
        "List investment application records, optionally filtered by status ('UnderReview'|'Active'|'Rejected'|'Inactive') and investorType. Call this for questions about applications awaiting review, active investments, or investor cohorts. There is no server-side filter for investment type (ShortTerm/LongTerm) -- each returned record has its own investmentType field, so filter for that yourself after fetching, not via a request parameter.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string" },
          investorType: { type: "string" },
          page: { type: "number" },
          pageSize: { type: "number" },
        },
      },
    },
    execute: (input, token) => {
      const p = withPageDefaults(input as Record<string, unknown>);
      return backendGet(applicationsPath(p), token);
    },
    // Two separate citations per row, on purpose: an investor's NAME should link to their
    // full statement page (all applications/redemptions/dividends combined) since one
    // investor can hold several applications, but the specific APPLICATION ID they came
    // from is still often what an admin wants to open directly (e.g. "which applications
    // are pending review" -- one row per application, not a rollup). No overlap risk: the
    // id-only citation below has no label, so it only ever matches a bare numeric App ID
    // cell (idFromCellText), never the name text findLabelMatches scans for.
    extractCitations: (result) => {
      const items = (result as { items?: unknown[] })?.items;
      const investorLabelFor = (r: Record<string, unknown>) =>
        (r.investorName as string) ||
        `${(r.userFirstName as string) ?? ""} ${(r.userLastName as string) ?? ""}`.trim() ||
        undefined;
      return [
        ...citationsFromRecords(items, "application", byIdField, (id) => `/applications/${id}`, () => undefined),
        ...citationsFromRecords(
          items,
          "investor",
          (item) => (typeof item.userId === "number" ? item.userId : undefined),
          (id) => `/investor-statements?userId=${id}`,
          investorLabelFor,
          byIdField,
        ),
      ];
    },
  },
  {
    definition: {
      name: "list_pending_changes",
      description:
        "List items in the maker-checker-approver queue, optionally filtered by status ('Pending'|'Checked'|'Approved'|'Rejected'|'Cancelled') and entityType ('Investment'|'Redemption'|'Distribution'|etc). Call this for questions about what's pending approval.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string" },
          entityType: { type: "string" },
          page: { type: "number" },
          pageSize: { type: "number" },
        },
      },
    },
    execute: (input, token) => {
      const p = withPageDefaults(input as Record<string, unknown>);
      return backendGet(pendingChangesPath(p), token);
    },
    // entityType/entityId are generic across the whole maker-checker-approver queue
    // (verified against AdminController.cs's SubmitPendingChangeAsync call sites) --
    // "Investment" changes pass the APPLICATION's own id as entityId (e.g.
    // applications/{id}/full), "Redemption" changes pass the redemption's own id. Bulk
    // operations (BulkUsers/BulkApplications/BulkRedemptions) and Distribution changes
    // have no per-record detail page in the admin app, so they're left uncited. There's
    // no investor-name field on this DTO to build a label from, so matching relies on the
    // model displaying the entity ID itself (which the system prompt's one-row-per-record
    // rule already asks for) rather than a name.
    extractCitations: (result) => {
      const items = (result as { items?: Array<Record<string, unknown>> })?.items ?? [];
      const idFor = (item: Record<string, unknown>) => (typeof item.entityId === "number" ? item.entityId : undefined);
      return [
        ...citationsFromRecords(
          items.filter((r) => r.entityType === "Investment"),
          "application",
          idFor,
          (id) => `/applications/${id}`,
          () => undefined,
        ),
        ...citationsFromRecords(
          items.filter((r) => r.entityType === "Redemption"),
          "redemption",
          idFor,
          (id) => `/redemptions/${id}`,
          () => undefined,
        ),
      ];
    },
  },
  {
    definition: {
      name: "get_pending_counts",
      description:
        "Get a quick summary count of items pending for checkers vs approvers. Cheaper than list_pending_changes when only a count is needed.",
      input_schema: { type: "object", properties: {} },
    },
    execute: (_input, token) => backendGet(pendingCountsPath(), token),
  },
  {
    definition: {
      name: "list_audit_logs",
      description:
        "List admin activity/audit log entries, optionally filtered by category ('Auth'|'Admin'|'Application'|'Redemption'|'Distribution'|'File'), eventType, userEmail, success (true/false), and an ISO from/to date range. Call this for 'what changed' or 'what happened' questions.",
      input_schema: {
        type: "object",
        properties: {
          category: { type: "string" },
          eventType: { type: "string" },
          userEmail: { type: "string" },
          success: { type: "boolean" },
          from: { type: "string", description: "ISO datetime" },
          to: { type: "string", description: "ISO datetime" },
          page: { type: "number" },
          pageSize: { type: "number" },
        },
      },
    },
    execute: (input, token) =>
      backendGet(auditLogsPath(withPageDefaults(input as Record<string, unknown>) as Record<string, string | number | boolean>), token).then(
        (result) => stripSensitiveFieldsFromItems(result, AUDIT_LOG_RAW_PAYLOAD_FIELDS),
      ),
    // Audit log entries carry both a generic entityId (meaning depends on entityName --
    // ambiguous the same way DocuSign's did) and a dedicated applicationId that, per
    // AdminService.cs's AuditEntry-logging call sites, is populated for
    // application/redemption/distribution events alike since everything cascades from an
    // Application. Linking via applicationId only (skipping entityId) is the same safe,
    // unambiguous choice already used for get_capital_ledger. No investor-name field
    // exists on this DTO, so label is left undefined -- matching relies on the model
    // showing the application/entity ID itself.
    extractCitations: (result) =>
      citationsFromRecords(
        (result as { items?: unknown[] })?.items,
        "application",
        (item) => (typeof item.applicationId === "number" ? item.applicationId : undefined),
        (id) => `/applications/${id}`,
        () => undefined,
      ),
  },
  {
    definition: {
      name: "list_distributions",
      description:
        "List monthly distribution records, optionally filtered by status ('Pending'|'Sent'|'Failed'|'Paid'), month (1-12), and year. Call this for questions about distributions paid, unpaid, or upcoming. To reliably find unpaid ones, pass status='Pending' rather than fetching everything and scanning -- it's a real backend filter, not a client-side guess.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Pending | Sent | Failed | Paid" },
          month: { type: "number", description: "1-12" },
          year: { type: "number" },
          page: { type: "number" },
          pageSize: { type: "number" },
        },
      },
    },
    execute: (input, token) => {
      const p = withPageDefaults(input as Record<string, unknown>);
      return backendGet(distributionsPath(p), token).then((result) =>
        stripSensitiveFieldsFromItems(result, DISTRIBUTION_BANK_DETAIL_FIELDS),
      );
    },
    // Same dual-citation split as list_applications, and for the same reason: a
    // distribution's investor NAME should open that investor's full statement page (where
    // distribution history actually lives), while the App ID column still opens the
    // specific application it was paid against. No overlap risk: the id-only citation has
    // no label, so it only matches a bare App ID cell (idFromCellText), never the name text.
    extractCitations: (result) => {
      const items = (result as { items?: unknown[] })?.items;
      return [
        ...citationsFromRecords(
          items,
          "application",
          (item) => (typeof item.applicationId === "number" ? item.applicationId : undefined),
          (id) => `/applications/${id}`,
          () => undefined,
        ),
        ...citationsFromRecords(
          items,
          "investor",
          (item) => (typeof item.userId === "number" ? item.userId : undefined),
          (id) => `/investor-statements?userId=${id}`,
          (r) => r.investorName as string,
          (item) => (typeof item.applicationId === "number" ? item.applicationId : undefined),
        ),
      ];
    },
  },
  {
    definition: {
      name: "get_capital_ledger",
      description:
        "Get the chronological capital-flow ledger (contributions, redemptions, distributions) for an optional date range, with running balances. This endpoint is NOT paginated — it returns every entry in the range you give it, so pass the narrowest from/to that answers the question. If you omit both, it defaults to the last 90 days rather than the fund's entire history. Call this for questions tracing why the cash position changed.",
      input_schema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Optional ISO date" },
          to: { type: "string", description: "Optional ISO date" },
        },
      },
    },
    execute: (input, token) => {
      const p = (input ?? {}) as { from?: string; to?: string };
      // The backend has no pagination for this endpoint (confirmed against
      // AdminController.cs's GetCapitalLedger) -- omitting both dates returns the fund's
      // entire all-time ledger, which is both a large token cost per call and a source of
      // mostly-unused citations (one per entry, regardless of whether the model ends up
      // mentioning it). Defaulting to a recent window when neither is given bounds that
      // worst case; a model that explicitly wants full history can still pass a wide
      // from/to itself.
      if (!p.from && !p.to) {
        const to = new Date();
        const from = new Date(to.getTime() - CAPITAL_LEDGER_DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        return backendGet(
          capitalLedgerPath({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }),
          token,
        );
      }
      return backendGet(capitalLedgerPath(p), token);
    },
    // Same dual-citation split as list_applications/list_distributions: the Investor
    // name always opens that investor's statement page, while a separate unlabeled
    // "application" citation covers the App ID column each ledger entry also carries.
    // Each ledger entry references its investment via applicationId, not its own id
    // (entries don't have a detail page of their own) — this is what makes two entries
    // for the same investor correctly resolve to two different applications.
    extractCitations: (result) => {
      const entries = (result as { entries?: unknown[] })?.entries;
      return [
        ...citationsFromRecords(
          entries,
          "application",
          (item) => (typeof item.applicationId === "number" ? item.applicationId : undefined),
          (id) => `/applications/${id}`,
          () => undefined,
        ),
        ...citationsFromRecords(
          entries,
          "investor",
          (item) => (typeof item.accountUserId === "number" ? item.accountUserId : undefined),
          (id) => `/investor-statements?userId=${id}`,
          (r) => (r.investorName as string) || (r.accountUserName as string) || (r.email as string),
          (item) => (typeof item.applicationId === "number" ? item.applicationId : undefined),
        ),
      ];
    },
  },
  {
    definition: {
      name: "list_users",
      description: "List registered investor/user accounts, optionally filtered by status or search term.",
      input_schema: {
        type: "object",
        properties: {
          search: { type: "string" },
          status: { type: "string" },
          page: { type: "number" },
          pageSize: { type: "number" },
        },
      },
    },
    execute: (input, token) => {
      const p = withPageDefaults(input as Record<string, unknown>);
      return backendGet(usersPath(p), token);
    },
    extractCitations: (result) =>
      citationsFromRecords(
        (result as { items?: unknown[] })?.items,
        "user",
        byIdField,
        (id) => `/users/${id}`,
        (r) => `${(r.firstName as string) ?? ""} ${(r.lastName as string) ?? ""}`.trim() || (r.email as string),
      ),
  },
  {
    definition: {
      name: "get_bank_details",
      description: "Get the fund's on-file bank account reference details.",
      input_schema: { type: "object", properties: {} },
    },
    execute: (_input, token) => backendGet(bankDetailsPath(), token),
  },
  {
    definition: {
      name: "get_daily_balances",
      description:
        "Get the manually-entered daily balance log (bank balance, deployed amount, interest/dividend received, other charges by date).",
      input_schema: { type: "object", properties: {} },
    },
    execute: (_input, token) => backendGet(dailyBalancesPath(), token),
  },
];
