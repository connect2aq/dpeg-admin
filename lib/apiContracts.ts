// Shared, pure endpoint path/param builders — no I/O, no environment-specific code
// (no localStorage, no fetch). Safe to import from both the client-side `adminApi`
// (lib/api.ts) and any server-side consumer (e.g. Executive Copilot's tools), so the
// two can never construct a different URL for the same logical request.
//
// Only the ~14 read-only endpoints used by Executive Copilot live here today; mutation
// endpoints stay defined inline in lib/api.ts since nothing outside that file needs them.

export type QueryParamPrimitive = string | number | boolean;
export type QueryParamValue =
  | QueryParamPrimitive
  | QueryParamPrimitive[]
  | undefined;
export type QueryParams = Record<string, QueryParamValue>;

export function buildQueryString(params: QueryParams = {}): string {
  const searchParams = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue == null) continue;
    if (Array.isArray(rawValue)) {
      rawValue.forEach((value) => searchParams.append(key, String(value)));
      continue;
    }
    searchParams.append(key, String(rawValue));
  }
  return searchParams.toString();
}

export function dashboardPath(params?: { from?: string; to?: string }): string {
  const qs =
    params && (params.from || params.to)
      ? "?" +
        buildQueryString(
          Object.fromEntries(
            Object.entries(params).filter(([, v]) => v != null),
          ) as QueryParams,
        )
      : "";
  return `/dashboard${qs}`;
}

export function dashboardTrendsPath(): string {
  return "/dashboard/trends";
}

export function redemptionsPath(params: QueryParams): string {
  const q = buildQueryString(params);
  return `/redemptions?${q}`;
}

export function redemptionPath(id: number): string {
  return `/redemptions/${id}`;
}

export function docuSignEnvelopesPath(): string {
  return "/docusign-envelopes";
}

export function applicationsPath(params: QueryParams): string {
  const q = buildQueryString(params);
  return `/applications?${q}`;
}

export function pendingChangesPath(
  params: QueryParams = {},
): string {
  const q = buildQueryString(params);
  return `/pending-changes${q ? "?" + q : ""}`;
}

export function pendingCountsPath(): string {
  return "/pending-changes/counts";
}

export function auditLogsPath(params: QueryParams): string {
  const q = buildQueryString(params);
  return `/audit-logs?${q}`;
}

export function distributionsPath(params: QueryParams): string {
  const q = buildQueryString(params);
  return `/distributions?${q}`;
}

export function capitalLedgerPath(
  params: { from?: string; to?: string } = {},
): string {
  const q = buildQueryString(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as QueryParams,
  );
  return `/capital-ledger${q ? "?" + q : ""}`;
}

export function usersPath(params: QueryParams): string {
  const q = buildQueryString(params);
  return `/users?${q}`;
}

export function investorStatementPath(
  userId: number,
  applicationId?: number,
): string {
  return `/investor-statement/${userId}${applicationId ? `?applicationId=${applicationId}` : ""}`;
}

export function bankDetailsPath(): string {
  return "/bank-details";
}

export function dailyBalancesPath(): string {
  return "/daily-balances";
}
