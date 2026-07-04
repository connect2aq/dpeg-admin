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
function citationsFromRecords(
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
function byIdField(item: Record<string, unknown>): number | undefined {
  return typeof item.id === "number" ? item.id : undefined;
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

export const EXECUTIVE_COPILOT_TOOLS: CopilotTool[] = [
  {
    definition: {
      name: "get_dashboard_stats",
      description:
        "Get current fund-wide cash and capital figures: bank account balance, deployed amount, total capital raised/redeemed/distributed, pending review/redemption counts. Response fields include redemptionInterestCommencement (all-time) and redemptionInterestDateRange (scoped to the from/to you pass) — this is specifically the interest/preferred-return component paid to investors AT REDEMPTION (exit), separate from monthlyDistributionsCommencement/monthlyDistributionsDateRange which is ongoing monthly distributions. For 'interest paid on redemptions' questions, this field is the authoritative source — do not try to derive it from raw redemption or capital-ledger records. For a month-by-month breakdown, call this tool once per month with from/to set to that month's start/end and read redemptionInterestDateRange each time.",
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
        results,
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
  },
  {
    definition: {
      name: "get_capital_ledger",
      description:
        "Get the chronological capital-flow ledger (contributions, redemptions, distributions) for an optional date range, with running balances. Call this for questions tracing why the cash position changed.",
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
