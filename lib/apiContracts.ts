// Shared, pure endpoint path/param builders — no I/O, no environment-specific code
// (no localStorage, no fetch). Safe to import from both the client-side `adminApi`
// (lib/api.ts) and any server-side consumer (e.g. Executive Copilot's tools), so the
// two can never construct a different URL for the same logical request.
//
// Only the ~14 read-only endpoints used by Executive Copilot live here today; mutation
// endpoints stay defined inline in lib/api.ts since nothing outside that file needs them.

export function dashboardPath(params?: { from?: string; to?: string }): string {
  const qs = params && (params.from || params.to)
    ? '?' + new URLSearchParams(Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null)
      ) as Record<string, string>).toString()
    : '';
  return `/dashboard${qs}`;
}

export function dashboardTrendsPath(): string {
  return '/dashboard/trends';
}

export function redemptionsPath(params: Record<string, string | number>): string {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  return `/redemptions?${q}`;
}

export function redemptionPath(id: number): string {
  return `/redemptions/${id}`;
}

export function docuSignEnvelopesPath(): string {
  return '/docusign-envelopes';
}

export function applicationsPath(params: Record<string, string | number>): string {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  return `/applications?${q}`;
}

export function pendingChangesPath(params: Record<string, string | number> = {}): string {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString();
  return `/pending-changes${q ? '?' + q : ''}`;
}

export function pendingCountsPath(): string {
  return '/pending-changes/counts';
}

export function auditLogsPath(params: Record<string, string | number | boolean>): string {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString();
  return `/audit-logs?${q}`;
}

export function distributionsPath(params: Record<string, string | number>): string {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  return `/distributions?${q}`;
}

export function capitalLedgerPath(params: { from?: string; to?: string } = {}): string {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>,
  ).toString();
  return `/capital-ledger${q ? '?' + q : ''}`;
}

export function usersPath(params: Record<string, string | number>): string {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  return `/users?${q}`;
}

export function bankDetailsPath(): string {
  return '/bank-details';
}

export function dailyBalancesPath(): string {
  return '/daily-balances';
}
