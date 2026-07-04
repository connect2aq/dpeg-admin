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
// Kept small deliberately: every extra record here is more JSON the model has to read
// and reason over before it can answer, which is the dominant cost in a multi-tool-call
// turn. The model can always ask again with a larger pageSize if it genuinely needs more.
const DEFAULT_PAGE_SIZE = 20;
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
): CopilotCitation[] {
  if (!Array.isArray(records)) return [];
  return records
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({ item, id: idFor(item) }))
    .filter((x): x is { item: Record<string, unknown>; id: number } => typeof x.id === "number")
    .map(({ item, id }) => ({
      type,
      id,
      label: labelFor(item),
      href: hrefFor(id),
    }));
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

Formatting rule for tables: when a table lists individual applications, redemptions, investors, or other records the admin might want to open, give each record its own row and its own cell containing that record's name — never combine multiple records' names into one comma-separated cell (e.g. one date or one status having several applications), and never collapse repeat entries into a "(x2)"-style count. One row per record is what lets the UI turn each one into a clickable link back to that record.
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
        "Get current fund-wide cash and capital figures: bank account balance, deployed amount, total capital raised/redeemed/distributed, pending review/redemption counts. Response fields include redemptionInterestCommencement (all-time) and redemptionInterestDateRange (scoped to the from/to you pass) — this is specifically the interest/preferred-return component paid to investors AT REDEMPTION (exit), separate from monthlyDistributionsCommencement/monthlyDistributionsDateRange which is ongoing monthly distributions. For 'interest paid on redemptions' questions, this field is the authoritative source — do not try to derive it from raw redemption or capital-ledger records. For a month-by-month breakdown, call this tool once per month with from/to set to that month's start/end and read redemptionInterestDateRange each time. For 'how many active investors' questions, activeInvestors is the authoritative count (a distinct investor with a currently-active investment) — do not substitute an application count or a user count instead, since one investor can hold multiple applications/investments. The response also includes totalUsers, neverApplied, awaitingApproval, and latestRejected (recruitment-funnel/registration metrics) — these are deliberately hidden from the CEO-facing dashboard and are NOT of interest to the CEO, so never surface them in an answer unless the question is specifically about registration/onboarding funnel counts.",
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
        "List redemption records, optionally filtered by status ('UnderReview'|'Active'|'Rejected'|'Redeemed') and investor type. Does NOT include DocuSign signature status — use get_redemption_details for that. Call this for questions about redemptions due, pending, or by status.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", description: "UnderReview | Active | Rejected | Redeemed" },
          investorType: { type: "string" },
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
        "List investment application records, optionally filtered by status ('UnderReview'|'Active'|'Rejected'|'Inactive') and investor type. Call this for questions about applications awaiting review, active investments, or investor cohorts.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string" },
          investorType: { type: "string" },
          investmentType: { type: "string" },
          page: { type: "number" },
          pageSize: { type: "number" },
        },
      },
    },
    execute: (input, token) => {
      const p = withPageDefaults(input as Record<string, unknown>);
      return backendGet(applicationsPath(p), token);
    },
    extractCitations: (result) =>
      citationsFromRecords(
        (result as { items?: unknown[] })?.items,
        "application",
        byIdField,
        (id) => `/applications/${id}`,
        (r) =>
          (r.investorName as string) ||
          `${(r.userFirstName as string) ?? ""} ${(r.userLastName as string) ?? ""}`.trim() ||
          undefined,
      ),
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
    execute: (input, token) => {
      const p = withPageDefaults(input as Record<string, unknown>);
      return backendGet(auditLogsPath(p as Record<string, string | number | boolean>), token);
    },
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
        "List monthly distribution records, optionally filtered by paymentStatus and distributionMonth. Call this for questions about distributions paid, unpaid, or upcoming.",
      input_schema: {
        type: "object",
        properties: {
          paymentStatus: { type: "string" },
          distributionMonth: { type: "string" },
          page: { type: "number" },
          pageSize: { type: "number" },
        },
      },
    },
    execute: (input, token) => {
      const p = withPageDefaults(input as Record<string, unknown>);
      return backendGet(distributionsPath(p), token);
    },
    // Distributions have no detail page of their own in the admin app (no
    // app/distributions/[id] route) -- link back to the investor's application instead,
    // which is where distribution history is actually reviewed from.
    extractCitations: (result) =>
      citationsFromRecords(
        (result as { items?: unknown[] })?.items,
        "application",
        (item) => (typeof item.applicationId === "number" ? item.applicationId : undefined),
        (id) => `/applications/${id}`,
        (r) => r.investorName as string,
      ),
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
    extractCitations: (result) =>
      citationsFromRecords(
        (result as { entries?: unknown[] })?.entries,
        "application",
        // Each ledger entry references its investment via applicationId, not its own id
        // (entries don't have a detail page of their own) — this is what makes two
        // entries for the same investor correctly resolve to two different applications.
        (item) => (typeof item.applicationId === "number" ? item.applicationId : undefined),
        (id) => `/applications/${id}`,
        (r) => (r.investorName as string) || (r.email as string),
      ),
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
