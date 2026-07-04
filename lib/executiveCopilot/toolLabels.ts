// Presentation-only mapping from internal tool names (what the model actually calls) to
// human-readable labels for the "Sources" footer. Deliberately separate from
// lib/executiveCopilot/tools.ts so this can be safely imported by client components
// without pulling in server-only tool-execution code.
const TOOL_LABELS: Record<string, string> = {
  get_dashboard_stats: "Fund Overview",
  get_dashboard_trends: "Fund Trends",
  list_redemptions: "Redemptions",
  get_redemption_details: "Redemption Details",
  list_docusign_envelopes: "DocuSign Status",
  list_applications: "Applications",
  list_pending_changes: "Pending Approvals",
  get_pending_counts: "Pending Approvals",
  list_audit_logs: "Activity Log",
  list_distributions: "Distributions",
  get_capital_ledger: "Capital Ledger",
  list_users: "Investors",
  get_bank_details: "Bank Details",
  get_daily_balances: "Daily Balances",
};

// Maps raw tool names to friendly labels and de-duplicates (e.g. list_pending_changes
// and get_pending_counts both read as "Pending Approvals" to a non-technical reader).
export function friendlySourceLabels(toolNames: string[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const name of toolNames) {
    const label = TOOL_LABELS[name] ?? name;
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}
