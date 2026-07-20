"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { PaginationControls } from "@/components/PaginationControls";
import { SortableTh } from "@/components/SortableTh";
import { formatShortDate } from "@/lib/dateFormat";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import {
  addRecentInvestor,
  getRecentInvestors,
  type RecentInvestor,
} from "@/lib/recentInvestors";
import {
  adminApi,
  type UserListItem,
  type UserDetail,
  type PagedResult,
  type ApplicationSummary,
  type InvestorCapitalAccount,
  type InvestorCapitalAccountEntry,
} from "@/lib/api";

type SortField =
  | "date"
  | "entryType"
  | "investmentType"
  | "investorName"
  | "accountUserName"
  | "applicationId"
  | "ppmRefNo"
  | "units"
  | "amount"
  | "income"
  | "runningBalance";

const sortValue = (
  e: InvestorCapitalAccountEntry,
  field: SortField,
): string | number => {
  switch (field) {
    case "date":
      return new Date(e.date).getTime();
    case "entryType":
      return e.entryType;
    case "investmentType":
      return e.investmentType ?? "";
    case "investorName":
      return e.investorName ?? "";
    case "accountUserName":
      return e.accountUserName ?? "";
    case "applicationId":
      return e.applicationId ?? -Infinity;
    case "ppmRefNo":
      return e.ppmRefNo ?? "";
    case "units":
      return e.units ?? -Infinity;
    case "amount":
      return e.amount;
    case "income":
      return e.income;
    case "runningBalance":
      return e.runningBalance;
  }
};

const ACTIVE_STATUSES = new Set(["Active", "Redeemed"]);
const DEFAULT_LIST_PAGE_SIZE = 10;

const TYPE_COLORS: Record<string, { badge: string; text: string }> = {
  Contribution: {
    badge: "bg-green-100 text-green-700",
    text: "text-green-700",
  },
  Redemption: { badge: "bg-red-100 text-red-700", text: "text-red-700" },
  Dividend: { badge: "bg-amber-100 text-amber-700", text: "text-amber-700" },
  Clawback: { badge: "bg-orange-100 text-orange-700", text: "text-orange-700" },
};

const fmt = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtSigned = (n: number) =>
  `${n < 0 ? "−" : "+"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtInvType(t?: string) {
  return t === "ShortTerm" ? "Short Term" : t === "LongTerm" ? "Long Term" : "";
}

function exportCSV(data: InvestorCapitalAccount, investorName: string) {
  const headers = [
    "Date",
    "Type",
    "Inv. Type",
    "Investor",
    "Account User",
    "App ID",
    "PPM Ref",
    "Units",
    "Capital",
    "Income",
    "Capital Balance",
  ];
  const rows = data.entries.map((e) => [
    formatShortDate(e.date),
    e.entryType,
    fmtInvType(e.investmentType),
    e.investorName ?? "",
    e.accountUserName ?? "",
    e.applicationId ? `#${e.applicationId}` : "",
    e.ppmRefNo ? `#${e.ppmRefNo}` : "",
    e.units ?? "",
    e.amount !== 0 ? e.amount.toFixed(2) : "",
    e.income > 0 ? e.income.toFixed(2) : "",
    e.amount !== 0 ? e.runningBalance.toFixed(2) : "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${v}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `capital-account-${investorName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(
  data: InvestorCapitalAccount,
  investorName: string,
  accrued: number,
) {
  const rows = data.entries
    .map(
      (e) => `
    <tr>
      <td>${formatShortDate(e.date)}</td>
      <td>${e.entryType}</td>
      <td>${fmtInvType(e.investmentType) || "—"}</td>
      <td>${e.investorName || "—"}</td>
      <td>${e.accountUserName || "—"}</td>
      <td>${e.applicationId ? "#" + e.applicationId : "—"}</td>
      <td>${e.ppmRefNo ? "#" + e.ppmRefNo : "—"}</td>
      <td class="r">${e.units ?? "—"}</td>
      <td class="r ${e.amount > 0 ? "green" : e.amount < 0 ? "red" : "muted"}">${e.amount !== 0 ? fmtSigned(e.amount) : "—"}</td>
      <td class="r amber">${e.income > 0 ? "+" + fmt(e.income) : "—"}</td>
      <td class="r">${e.amount !== 0 ? fmt(e.runningBalance) : "—"}</td>
    </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Capital Account Statement — ${investorName}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a2e; margin: 0; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #0f2342; padding-bottom: 16px; }
    .header h1 { margin: 0; font-size: 18px; color: #0f2342; }
    .header p { margin: 4px 0 0; color: #666; font-size: 11px; }
    .meta { text-align: right; color: #666; font-size: 11px; }
    .cards { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .card { border: 1px solid #dde; border-radius: 8px; padding: 10px 14px; min-width: 120px; }
    .card label { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 2px; }
    .card .val { font-size: 15px; font-weight: 700; color: #0f2342; }
    .card .sub { font-size: 9px; color: #888; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #f5f7fa; text-align: left; padding: 7px 8px; font-size: 10px; font-weight: 700; color: #666; border-bottom: 1px solid #dde; }
    td { padding: 6px 8px; border-bottom: 1px solid #eef; font-size: 10px; }
    .r { text-align: right; }
    .green { color: #15803d; font-weight: 600; }
    .red { color: #b91c1c; font-weight: 600; }
    .amber { color: #b45309; font-weight: 600; }
    .muted { color: #999; }
    tfoot td { font-weight: 700; border-top: 2px solid #0f2342; background: #f5f7fa; }
    .footnote { margin-top: 20px; padding: 10px 14px; border: 1px solid #dde; border-radius: 8px; font-size: 10px; color: #666; line-height: 1.6; }
    @media print { body { padding: 16px; } }
  </style></head><body>
  <div class="header">
    <div>
      <h1>Capital Account Statement</h1>
      <p>DPEG Real Estate Fund &nbsp;·&nbsp; <strong>${investorName}</strong></p>
    </div>
    <div class="meta">
      <div>Generated: ${formatShortDate(new Date())}</div>
      <div style="margin-top:4px;color:#888;">For internal use</div>
    </div>
  </div>
  <div class="cards">
    <div class="card"><label>Total Contributed</label><div class="val green">${fmt(data.totalContributions)}</div></div>
    <div class="card"><label>Capital Deployed</label><div class="val">${fmt(data.netPosition)}</div></div>
    <div class="card"><label>Total Income</label><div class="val amber">${fmt(data.totalIncome)}</div></div>
    <div class="card"><label>Accrued (Unpaid)</label><div class="val amber">${fmt(accrued)}</div></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th>Inv. Type</th><th>Investor</th><th>Account User</th><th>App ID</th><th>PPM Ref</th><th class="r">Units</th><th class="r">Capital</th><th class="r">Income</th><th class="r">Capital Balance</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="8">${data.entries.length} entries</td>
      <td class="r">${fmtSigned(data.entries.reduce((s, e) => s + e.amount, 0))}</td>
      <td class="r amber">+${fmt(data.totalIncome)}</td>
      <td class="r">${fmt(data.netPosition)}</td>
    </tr></tfoot>
  </table>
  <div class="footnote">
    <strong>Capital Balance</strong> tracks capital deployed — increases on contributions, decreases when capital is returned on redemption.
    Dividends are income paid to the investor's bank and do not reduce capital balance. Accrued (unpaid) interest will appear as a Dividend once distributed.
  </div>
  </body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 600);
}

export default function InvestorStatementsPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout>
          <div style={{ padding: 32, color: "var(--muted)" }}>Loading...</div>
        </AdminLayout>
      }
    >
      <InvestorStatementsContent />
    </Suspense>
  );
}

type InvestorRowData = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  status?: string;
  investorNames?: string[];
};

function InvestorRow({
  row,
  selected,
  onClick,
}: {
  row: InvestorRowData;
  selected: boolean;
  onClick: () => void;
}) {
  const accountName = `${row.firstName} ${row.lastName}`.trim().toLowerCase();
  const otherInvestorNames = (row.investorNames ?? []).filter(
    (n) => n.trim().toLowerCase() !== accountName,
  );
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "8px 12px",
        background: selected ? "var(--forest-light)" : "none",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        textAlign: "left",
        marginBottom: 2,
        outline: "none",
        borderLeft: selected ? "3px solid var(--forest)" : "3px solid transparent",
        paddingLeft: selected ? 9 : 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: selected ? "var(--forest-mid)" : "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.firstName} {row.lastName}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            marginTop: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.email}
        </div>
        {otherInvestorNames.length > 0 && (
          <div
            style={{
              fontSize: 10,
              color: "var(--forest)",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Investor: {otherInvestorNames.join(", ")}
          </div>
        )}
      </div>
      {row.status && row.status !== "Active" && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--muted)",
            background: "var(--bg-section)",
            borderRadius: 4,
            padding: "2px 6px",
            flexShrink: 0,
          }}
        >
          {row.status}
        </span>
      )}
    </button>
  );
}

function InvestorStatementsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // ---- Left panel: searchable/paged investor list ----
  const [search, setSearch] = useState("");
  const [showOnlyFunded, setShowOnlyFunded] = useState(true);
  const [listSort, setListSort] = useState<
    "createdOn_desc" | "createdOn_asc" | "name_asc" | "name_desc"
  >("createdOn_desc");
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [listResult, setListResult] = useState<PagedResult<UserListItem> | null>(
    null,
  );
  const [listLoading, setListLoading] = useState(true);
  const [recentInvestors, setRecentInvestors] = useState<RecentInvestor[]>([]);

  useEffect(() => {
    setRecentInvestors(getRecentInvestors(5));
  }, []);

  const loadList = useCallback(() => {
    setListLoading(true);
    const [sortOn, sortDirection] =
      listSort === "createdOn_desc"
        ? ["createdOn", "desc"]
        : listSort === "createdOn_asc"
          ? ["createdOn", "asc"]
          : listSort === "name_asc"
            ? ["name", "asc"]
            : ["name", "desc"];
    adminApi
      .users({
        page: listPage,
        pageSize: listPageSize,
        search: search || undefined,
        hasDeposit: showOnlyFunded || undefined,
        sortOn,
        sortDirection,
      })
      .then((r) => {
        if (r.success) setListResult(r.data);
      })
      .finally(() => setListLoading(false));
  }, [listPage, listPageSize, search, showOnlyFunded, listSort]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // ---- Right panel: selected investor + statement ----
  // Deep-link support (e.g. from the Executive Copilot's investor citations, or the
  // Applications/Users/Redemptions/Distributions/Capital Ledger pages) — reading the
  // URL directly into the initial state so a `?userId=` link populates the right panel
  // immediately without waiting on the left panel's list to load.
  const [selectedUserId, setSelectedUserId] = useState<number | null>(() => {
    const raw = searchParams.get("userId");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });
  // null = whole account (all investments); a number scopes the statement to one application.
  const [selectedApplicationId, setSelectedApplicationId] = useState<
    number | null
  >(() => {
    const raw = searchParams.get("applicationId");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetail | null>(
    null,
  );
  const [investments, setInvestments] = useState<ApplicationSummary[]>([]);
  const [excludedApplications, setExcludedApplications] = useState<
    ApplicationSummary[]
  >([]);
  const [data, setData] = useState<InvestorCapitalAccount | null>(null);
  const [accrued, setAccrued] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (field: string) => {
    const f = field as SortField;
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      setSortDir("asc");
    }
  };

  useEffect(() => {
    if (!selectedUserId) {
      setSelectedUserDetail(null);
      setInvestments([]);
      setExcludedApplications([]);
      return;
    }
    adminApi
      .user(selectedUserId)
      .then((r) => {
        if (!r.success || !r.data) {
          setSelectedUserDetail(null);
          setInvestments([]);
          setExcludedApplications([]);
          return;
        }
        setSelectedUserDetail(r.data);
        setInvestments(
          r.data.applications.filter((a) => ACTIVE_STATUSES.has(a.status)),
        );
        setExcludedApplications(
          r.data.applications.filter((a) => !ACTIVE_STATUSES.has(a.status)),
        );
        addRecentInvestor({
          id: r.data.id,
          firstName: r.data.firstName,
          lastName: r.data.lastName,
          email: r.data.email,
        });
        setRecentInvestors(getRecentInvestors(5));
      })
      .catch(() => {
        setSelectedUserDetail(null);
        setInvestments([]);
        setExcludedApplications([]);
      });
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) {
      setData(null);
      setAccrued(0);
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    adminApi
      .investorStatement(selectedUserId, selectedApplicationId ?? undefined)
      .then((r) => {
        if (r.success && r.data) {
          setData(r.data);
          setAccrued(r.data.accrued ?? 0);
        } else {
          setError("No data found for this investor.");
        }
      })
      .catch(() => setError("Failed to load statement."))
      .finally(() => setLoading(false));
  }, [selectedUserId, selectedApplicationId]);

  function selectInvestor(id: number) {
    setSelectedApplicationId(null);
    setSelectedUserId(id);
    router.replace(`/investor-statements?userId=${id}`, { scroll: false });
  }

  function clearSelection() {
    setSelectedUserId(null);
    setSelectedApplicationId(null);
    router.replace("/investor-statements", { scroll: false });
  }

  const investorName = selectedUserDetail
    ? `${selectedUserDetail.firstName} ${selectedUserDetail.lastName}`
    : "";
  const scopedInvestment = investments.find(
    (a) => a.id === selectedApplicationId,
  );
  // Label used for export filenames/titles — the specific investor/entity name when
  // scoped to one investment, otherwise the account holder's name.
  const exportLabel = scopedInvestment?.investorName || investorName;

  const visible: InvestorCapitalAccountEntry[] = (data?.entries ?? []).filter(
    (e) => {
      if (typeFilter.length > 0 && !typeFilter.includes(e.entryType))
        return false;
      const entryDate = e.date.slice(0, 10); // "YYYY-MM-DD", comparable lexicographically
      if (fromDate && entryDate < fromDate) return false;
      if (toDate && entryDate > toDate) return false;
      return true;
    },
  );

  const sortedVisible = [...visible].sort((a, b) => {
    const av = sortValue(a, sortField);
    const bv = sortValue(b, sortField);
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const showRecent =
    recentInvestors.length > 0 && !search && listPage === 1;

  return (
    <AdminLayout>
      <div style={{ padding: "20px 20px", maxWidth: 1700 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--forest)",
              margin: 0,
            }}
          >
            Investor Statements
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            Search for an investor on the left to view and export their
            Capital Account Statement.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          {/* Left panel — search / recent / all investors */}
          <div style={{ flex: "1 1 200px", maxWidth: 230 }}>
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ position: "relative", marginBottom: 14 }}>
                <input
                  type="text"
                  placeholder="Search name, email, or investor entity..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setListPage(1);
                  }}
                  style={{
                    width: "100%",
                    padding: search ? "9px 30px 9px 12px" : "9px 12px",
                    fontSize: 13,
                    border: "1.5px solid var(--border)",
                    borderRadius: 8,
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setListPage(1);
                    }}
                    title="Clear search"
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--muted)",
                      fontSize: 15,
                      lineHeight: 1,
                      padding: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              {showRecent && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 6,
                    }}
                  >
                    Recently Viewed
                  </div>
                  {recentInvestors.map((r) => (
                    <InvestorRow
                      key={r.id}
                      row={r}
                      selected={r.id === selectedUserId}
                      onClick={() => selectInvestor(r.id)}
                    />
                  ))}
                </div>
              )}

              <div style={{ marginBottom: 6 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 4,
                  }}
                >
                  All Investors
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 11,
                      color: "var(--muted)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showOnlyFunded}
                      onChange={(e) => {
                        setShowOnlyFunded(e.target.checked);
                        setListPage(1);
                      }}
                    />
                    Funded only
                  </label>
                  <select
                    value={listSort}
                    onChange={(e) => {
                      setListSort(e.target.value as typeof listSort);
                      setListPage(1);
                    }}
                    style={{
                      width: "100%",
                      fontSize: 11,
                      color: "var(--muted)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "var(--bg-card)",
                      padding: "4px 6px",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="createdOn_desc">Newest Registered</option>
                    <option value="createdOn_asc">Oldest Registered</option>
                    <option value="name_asc">Name (A–Z)</option>
                    <option value="name_desc">Name (Z–A)</option>
                  </select>
                </div>
              </div>

              <div style={{ minHeight: 80 }}>
                {listLoading ? (
                  <div
                    style={{
                      padding: "16px 0",
                      fontSize: 13,
                      color: "var(--muted)",
                      textAlign: "center",
                    }}
                  >
                    Loading…
                  </div>
                ) : !listResult || listResult.items.length === 0 ? (
                  <div
                    style={{
                      padding: "16px 0",
                      fontSize: 13,
                      color: "var(--muted)",
                      textAlign: "center",
                    }}
                  >
                    No investors found.
                  </div>
                ) : (
                  listResult.items.map((u) => (
                    <InvestorRow
                      key={u.id}
                      row={u}
                      selected={u.id === selectedUserId}
                      onClick={() => selectInvestor(u.id)}
                    />
                  ))
                )}
              </div>

              <div style={{ marginTop: 8 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {listResult?.totalCount ?? 0} investors
                  </span>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 11,
                      color: "var(--muted)",
                    }}
                  >
                    Rows
                    <select
                      value={listPageSize}
                      onChange={(e) => {
                        setListPageSize(parseInt(e.target.value, 10));
                        setListPage(1);
                      }}
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        background: "var(--bg-card)",
                        padding: "3px 4px",
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <PaginationControls
                  page={listPage}
                  totalPages={listResult?.totalPages ?? 1}
                  onPageChange={setListPage}
                  containerStyle={{ justifyContent: "center" }}
                  controlsStyle={{ flexWrap: "nowrap", gap: 6 }}
                  buttonStyle={{ padding: "5px 8px", fontSize: 11 }}
                  inputStyle={{ width: 34, padding: "4px 2px", fontSize: 11 }}
                />
              </div>
            </div>
          </div>

          {/* Right panel — selected investor's statement */}
          <div style={{ flex: "3 1 420px", minWidth: 0 }}>
            {!selectedUserId && (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 48,
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: 14,
                }}
              >
                Select an investor from the list to view their Capital
                Account Statement.
              </div>
            )}

            {selectedUserId && loading && (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 48,
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: 14,
                }}
              >
                Loading…
              </div>
            )}

            {selectedUserId && !loading && error && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 12,
                  padding: 24,
                  textAlign: "center",
                  color: "#b91c1c",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            {selectedUserId && data && (
              <>
                {/* Investor name */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: "var(--forest)",
                      }}
                    >
                      {investorName}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        marginLeft: 10,
                      }}
                    >
                      {selectedUserDetail?.email}
                    </span>
                    {scopedInvestment && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          marginTop: 4,
                        }}
                      >
                        Viewing investment:{" "}
                        <strong style={{ color: "var(--text-primary)" }}>
                          {scopedInvestment.investorName || investorName}
                        </strong>{" "}
                        (App #{scopedInvestment.id}
                        {scopedInvestment.ppmRefNO
                          ? `, PPM #${scopedInvestment.ppmRefNO}`
                          : ""}
                        )
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={clearSelection}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      fontSize: 12,
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      background: "var(--bg-card)",
                      color: "var(--muted)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    × Clear
                  </button>
                </div>

                {/* Excluded-applications notice — this statement only reflects funded (Active/Redeemed) capital */}
                {excludedApplications.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      marginBottom: 16,
                      padding: "12px 18px",
                      background: "#fffbeb",
                      border: "1.5px solid #fbbf24",
                      borderRadius: 10,
                    }}
                  >
                    <span style={{ fontSize: 16, lineHeight: "18px" }}>⚠️</span>
                    <span
                      style={{ fontSize: 13, color: "#92400e", lineHeight: 1.5 }}
                    >
                      This statement only reflects <strong>funded capital</strong>{" "}
                      (Active or Redeemed investments).{" "}
                      <strong>
                        {excludedApplications.length} application
                        {excludedApplications.length !== 1 ? "s" : ""} for this
                        investor
                      </strong>{" "}
                      {excludedApplications.length !== 1 ? "are" : "is"} not
                      included below —{" "}
                      {Object.entries(
                        excludedApplications.reduce<Record<string, number>>(
                          (acc, a) => {
                            acc[a.status] = (acc[a.status] ?? 0) + 1;
                            return acc;
                          },
                          {},
                        ),
                      ).map(([status, count], i, arr) => (
                        <span key={status}>
                          {count}{" "}
                          {status === "UnderReview" ? "Under Review" : status}
                          {i < arr.length - 1 ? ", " : ""}
                        </span>
                      ))}{" "}
                      — since no capital has been deployed for them yet (or, if
                      rejected, none ever will be).
                    </span>
                  </div>
                )}

                {/* Investment scope selector — only meaningful when this account has more than one investment */}
                {investments.length > 1 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      marginBottom: 16,
                    }}
                  >
                    <button
                      onClick={() => setSelectedApplicationId(null)}
                      style={{
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 999,
                        cursor: "pointer",
                        border: `1.5px solid ${selectedApplicationId === null ? "var(--forest)" : "var(--border)"}`,
                        background:
                          selectedApplicationId === null
                            ? "var(--forest)"
                            : "var(--bg-card)",
                        color:
                          selectedApplicationId === null
                            ? "#fff"
                            : "var(--text-primary)",
                      }}
                    >
                      All Investments
                    </button>
                    {investments.map((inv) => {
                      const active = selectedApplicationId === inv.id;
                      return (
                        <button
                          key={inv.id}
                          onClick={() => setSelectedApplicationId(inv.id)}
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            borderRadius: 999,
                            cursor: "pointer",
                            border: `1.5px solid ${active ? "var(--forest)" : "var(--border)"}`,
                            background: active ? "var(--forest)" : "var(--bg-card)",
                            color: active ? "#fff" : "var(--text-primary)",
                          }}
                        >
                          {inv.investorName || investorName} · #{inv.id}
                          {inv.ppmRefNO ? ` · PPM #${inv.ppmRefNO}` : ""}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Summary cards */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                    marginBottom: 20,
                  }}
                >
                  {[
                    {
                      label: "Total Contributed",
                      value: fmt(data.totalContributions),
                      color: "#15803d",
                    },
                    {
                      label: "Capital Deployed",
                      value: fmt(data.netPosition),
                      color: "var(--forest)",
                    },
                    {
                      label: "Total Income",
                      value: fmt(data.totalIncome),
                      color: "#b45309",
                    },
                    {
                      label: "Accrued (Unpaid)",
                      value: fmt(accrued),
                      color: "#b45309",
                    },
                  ].map((c) => (
                    <div
                      key={c.label}
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: "12px 16px",
                        minWidth: 140,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--muted)",
                          marginBottom: 4,
                        }}
                      >
                        {c.label}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 20,
                          fontWeight: 700,
                          color: c.color,
                        }}
                      >
                        {c.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Filter + Export */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <MultiSelectFilter
                      allLabel="All Activity"
                      buttonLabel="Activity"
                      options={[
                        { value: "Contribution", label: "Contributions" },
                        { value: "Redemption", label: "Redemptions" },
                        { value: "Dividend", label: "Dividends" },
                      ]}
                      selectedValues={typeFilter}
                      onChange={setTypeFilter}
                      minWidth={180}
                    />
                    <input
                      type="date"
                      value={fromDate}
                      max={toDate || undefined}
                      onChange={(e) => {
                        const nextFrom = e.target.value;
                        setFromDate(nextFrom);
                        if (toDate && nextFrom && toDate < nextFrom) setToDate(nextFrom);
                      }}
                      title="From date"
                      style={{
                        padding: "7px 10px",
                        fontSize: 12,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        background: "var(--bg-card)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>–</span>
                    <input
                      type="date"
                      value={toDate}
                      min={fromDate || undefined}
                      onChange={(e) => {
                        const nextTo = e.target.value;
                        setToDate(nextTo);
                        if (fromDate && nextTo && fromDate > nextTo) setFromDate(nextTo);
                      }}
                      title="To date"
                      style={{
                        padding: "7px 10px",
                        fontSize: 12,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        background: "var(--bg-card)",
                        color: "var(--text-primary)",
                      }}
                    />
                    {(typeFilter.length > 0 || fromDate || toDate) && (
                      <button
                        onClick={() => {
                          setTypeFilter([]);
                          setFromDate("");
                          setToDate("");
                        }}
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        Reset
                      </button>
                    )}
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {visible.length} entries
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => exportCSV(data, exportLabel)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "7px 12px",
                        fontSize: 12,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        background: "var(--bg-card)",
                        color: "var(--muted)",
                        cursor: "pointer",
                      }}
                    >
                      ↓ CSV
                    </button>
                    <button
                      onClick={() => exportPDF(data, exportLabel, accrued)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "7px 12px",
                        fontSize: 12,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        background: "var(--bg-card)",
                        color: "var(--muted)",
                        cursor: "pointer",
                      }}
                    >
                      ↓ PDF
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <div className="table-scroll">
                    <table className="ledger-table" style={{ minWidth: 820 }}>
                      <thead>
                        <tr
                          style={{
                            background: "var(--bg-section)",
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          {(
                            [
                              ["applicationId", "App ID", "left"],
                              ["date", "Date", "left"],
                              ["accountUserName", "Account User", "left"],
                              ["investorName", "Investor", "left"],
                              ["entryType", "Type", "left"],
                              ["investmentType", "Inv. Type", "left"],
                              ["units", "Units", "right"],
                              ["amount", "Capital", "right"],
                              ["income", "Income", "right"],
                              ["runningBalance", "Capital Balance", "right"],
                            ] as [SortField, string, "left" | "right"][]
                          ).map(([field, label, align]) => (
                            <SortableTh
                              key={field}
                              label={label}
                              sortKey={field}
                              sortOn={sortField}
                              sortDirection={sortDir}
                              onSort={toggleSort}
                              style={{
                                padding: "7px 10px",
                                textAlign: align,
                                fontWeight: 600,
                                fontSize: 11,
                                color: "var(--muted)",
                                whiteSpace: "nowrap",
                              }}
                            />
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedVisible.map((e, i) => {
                          const colors =
                            TYPE_COLORS[e.entryType] ?? TYPE_COLORS.Contribution;
                          return (
                            <tr
                              key={i}
                              style={{
                                borderBottom: "1px solid var(--border)",
                                background:
                                  i % 2 === 0 ? undefined : "var(--bg-section)",
                              }}
                            >
                              <td style={{ padding: "7px 10px", fontSize: 11 }}>
                                {e.applicationId ? (
                                  <Link
                                    href={`/applications/${e.applicationId}`}
                                    style={{
                                      color: "var(--forest)",
                                      textDecoration: "underline",
                                      fontWeight: 600,
                                    }}
                                  >
                                    #{e.applicationId}
                                  </Link>
                                ) : (
                                  <span style={{ color: "var(--muted)" }}>—</span>
                                )}
                              </td>

                              <td
                                style={{
                                  padding: "7px 10px",
                                  fontSize: 11,
                                  color: "var(--text-primary)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {formatShortDate(e.date)}
                              </td>
                              <td
                                style={{
                                  padding: "7px 10px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: "var(--text-primary)",
                                  maxWidth: 140,
                                  whiteSpace: "normal",
                                  wordBreak: "break-word",
                                }}
                              >
                                {e.accountUserName || "—"}
                              </td>
                              <td
                                style={{
                                  padding: "7px 10px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: "var(--text-primary)",
                                  maxWidth: 140,
                                  whiteSpace: "normal",
                                  wordBreak: "break-word",
                                }}
                              >
                                {e.investorName || "—"}
                              </td>
                              <td style={{ padding: "7px 10px" }}>
                                <span
                                  className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${colors.badge}`}
                                >
                                  {e.entryType}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "7px 10px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {e.investmentType ? (
                                  <span
                                    style={{
                                      background:
                                        e.investmentType === "ShortTerm"
                                          ? "#eff6ff"
                                          : "#f5f3ff",
                                      color:
                                        e.investmentType === "ShortTerm"
                                          ? "#1d4ed8"
                                          : "#6d28d9",
                                      fontWeight: 600,
                                      fontSize: 11,
                                      borderRadius: 5,
                                      padding: "3px 8px",
                                    }}
                                  >
                                    {e.investmentType === "ShortTerm"
                                      ? "Short Term"
                                      : "Long Term"}
                                  </span>
                                ) : (
                                  <span
                                    style={{ color: "var(--muted)", fontSize: 11 }}
                                  >
                                    —
                                  </span>
                                )}
                              </td>

                              <td
                                style={{
                                  padding: "7px 10px",
                                  fontSize: 11,
                                  textAlign: "right",
                                  color: "var(--text-primary)",
                                }}
                              >
                                {e.units != null ? e.units : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "7px 10px",
                                  fontSize: 11,
                                  textAlign: "right",
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                  color:
                                    e.amount > 0
                                      ? "#15803d"
                                      : e.amount < 0
                                        ? "#b91c1c"
                                        : "var(--muted)",
                                }}
                              >
                                {e.amount !== 0 ? fmtSigned(e.amount) : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "7px 10px",
                                  fontSize: 11,
                                  textAlign: "right",
                                  fontWeight: 600,
                                  color: e.income < 0 ? "#c2410c" : "#b45309",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {e.income > 0
                                  ? `+${fmt(e.income)}`
                                  : e.income < 0
                                    ? `−${fmt(Math.abs(e.income))}`
                                    : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "7px 10px",
                                  fontSize: 11,
                                  textAlign: "right",
                                  fontWeight: 600,
                                  color: "var(--text-primary)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {e.amount !== 0 ? (
                                  fmt(e.runningBalance)
                                ) : (
                                  <span
                                    style={{ color: "var(--muted)", fontSize: 11 }}
                                  >
                                    —
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr
                          style={{
                            borderTop: "2px solid var(--border)",
                            background: "var(--bg-section)",
                          }}
                        >
                          <td
                            colSpan={7}
                            style={{
                              padding: "7px 10px",
                              fontWeight: 600,
                              color: "var(--muted)",
                              fontSize: 11,
                            }}
                          >
                            {visible.length} entries
                          </td>
                          <td
                            style={{
                              padding: "7px 10px",
                              textAlign: "right",
                              fontWeight: 700,
                              color: "var(--text-primary)",
                              fontSize: 12,
                            }}
                          >
                            {fmtSigned(visible.reduce((s, e) => s + e.amount, 0))}
                          </td>
                          <td
                            style={{
                              padding: "7px 10px",
                              textAlign: "right",
                              fontWeight: 700,
                              color: "#b45309",
                              fontSize: 12,
                            }}
                          >
                            {(() => {
                              const t = visible.reduce(
                                (s, e) => s + (e.income ?? 0),
                                0,
                              );
                              return t >= 0 ? `+${fmt(t)}` : `−${fmt(Math.abs(t))}`;
                            })()}
                          </td>
                          <td
                            style={{
                              padding: "7px 10px",
                              textAlign: "right",
                              fontWeight: 700,
                              color: "var(--text-primary)",
                              fontSize: 12,
                            }}
                          >
                            {fmt(data.netPosition)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
