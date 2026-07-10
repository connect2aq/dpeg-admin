"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { SortableTh } from "@/components/SortableTh";
import {
  adminApi,
  type UserListItem,
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
    new Date(e.date).toLocaleDateString("en-US"),
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
      <td>${new Date(e.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</td>
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
      <div>Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
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

function InvestorStatementsContent() {
  const searchParams = useSearchParams();
  const [investors, setInvestors] = useState<UserListItem[]>([]);
  // Deep-link support (e.g. from the Executive Copilot's investor citations): reading the
  // URL directly into the initial state, same pattern already used by
  // app/applications/page.tsx, rather than an effect -- the investorStatement fetch
  // effect below only needs the id itself, not the investors list to have loaded first.
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
  const [investments, setInvestments] = useState<ApplicationSummary[]>([]);
  const [excludedApplications, setExcludedApplications] = useState<
    ApplicationSummary[]
  >([]);
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InvestorCapitalAccount | null>(null);
  const [accrued, setAccrued] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [investorsLoading, setInvestorsLoading] = useState(true);
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
  // Captures the search text at the moment an investor is picked, so once that user's
  // investments load we can tell whether the match was a specific investor/entity name
  // (vs. the account holder's own name or email) and auto-scope to that one investment.
  const scopeQueryRef = useRef("");

  useEffect(() => {
    adminApi
      .users({ page: 1, pageSize: 500 })
      .then((r) => {
        if (r.success) setInvestors(r.data.items);
      })
      .catch(() => {})
      .finally(() => setInvestorsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setInvestments([]);
      setExcludedApplications([]);
      return;
    }
    adminApi
      .user(selectedUserId)
      .then((r) => {
        if (!r.success || !r.data) {
          setInvestments([]);
          setExcludedApplications([]);
          return;
        }
        const active = r.data.applications.filter((a) =>
          ACTIVE_STATUSES.has(a.status),
        );
        setInvestments(active);
        setExcludedApplications(
          r.data.applications.filter((a) => !ACTIVE_STATUSES.has(a.status)),
        );

        const q = scopeQueryRef.current.trim().toLowerCase();
        scopeQueryRef.current = "";
        if (!q) return;
        const accountName = `${r.data.firstName} ${r.data.lastName}`
          .trim()
          .toLowerCase();
        const matches = active.filter(
          (a) =>
            a.investorName &&
            a.investorName.trim().toLowerCase() !== accountName &&
            a.investorName.toLowerCase().includes(q),
        );
        // Only auto-scope when the query uniquely identifies one investment — an
        // ambiguous match (e.g. the account holder's own name) falls back to "all".
        setSelectedApplicationId(matches.length === 1 ? matches[0].id : null);
      })
      .catch(() => {
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

  const suggestions = investors
    .filter((u) => {
      if (!inputValue || selectedUserId) return false;
      const q = inputValue.toLowerCase();
      const haystack = `${u.firstName} ${u.lastName} ${u.email} ${u.investorNames.join(" ")}`;
      return haystack.toLowerCase().includes(q);
    })
    .slice(0, 8);

  const selectedInvestor = investors.find((u) => u.id === selectedUserId);
  const investorName = selectedInvestor
    ? `${selectedInvestor.firstName} ${selectedInvestor.lastName}`
    : "";
  const scopedInvestment = investments.find(
    (a) => a.id === selectedApplicationId,
  );
  // Label used for export filenames/titles — the specific investor/entity name when
  // scoped to one investment, otherwise the account holder's name.
  const exportLabel = scopedInvestment?.investorName || investorName;

  function selectInvestor(u: UserListItem) {
    scopeQueryRef.current = inputValue;
    setSelectedUserId(u.id);
    setInputValue(`${u.firstName} ${u.lastName}`);
    setOpen(false);
  }

  function clearSelection() {
    setSelectedUserId(null);
    setSelectedApplicationId(null);
    setInvestments([]);
    setInputValue("");
    setData(null);
    setOpen(false);
  }

  const visible: InvestorCapitalAccountEntry[] = (data?.entries ?? []).filter(
    (e) => {
      if (typeFilter && e.entryType !== typeFilter) return false;
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

  return (
    <AdminLayout>
      <div style={{ padding: "28px 32px", maxWidth: 1500 }}>
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
            View and export Capital Account Statements for any investor.
          </p>
        </div>

        {/* Investor combobox */}
        <div style={{ marginBottom: 28, maxWidth: 480, position: "relative" }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 6,
            }}
          >
            Search Account User or Investor
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder={
                investorsLoading
                  ? "Loading investors…"
                  : "Search Account User or Investor…"
              }
              value={inputValue || investorName}
              disabled={investorsLoading}
              onChange={(e) => {
                setInputValue(e.target.value);
                setOpen(true);
                if (selectedUserId) clearSelection();
              }}
              onFocus={() => {
                if (!selectedUserId && inputValue) setOpen(true);
              }}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              style={{
                width: "100%",
                padding: "10px 36px 10px 14px",
                fontSize: 13,
                border: `1.5px solid ${open ? "var(--forest)" : "var(--border)"}`,
                borderRadius: 8,
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
            {selectedUserId ? (
              <button
                onClick={clearSelection}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--muted)",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: 2,
                }}
                title="Clear"
              >
                ×
              </button>
            ) : (
              <span
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--muted)",
                  fontSize: 12,
                  pointerEvents: "none",
                }}
              >
                ▾
              </span>
            )}
          </div>
          {open && suggestions.length > 0 && (
            <div
              style={{
                position: "absolute",
                zIndex: 50,
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                background: "var(--bg-card)",
                border: "1.5px solid var(--border)",
                borderRadius: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                overflow: "hidden",
              }}
            >
              {suggestions.map((u) => (
                <button
                  key={u.id}
                  onMouseDown={() => selectInvestor(u)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "10px 14px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-section)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "none")
                  }
                >
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {u.firstName} {u.lastName}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        marginTop: 1,
                      }}
                    >
                      {u.email}
                    </div>
                    {(() => {
                      const accountName = `${u.firstName} ${u.lastName}`
                        .trim()
                        .toLowerCase();
                      const otherInvestorNames = u.investorNames.filter(
                        (n) => n.trim().toLowerCase() !== accountName,
                      );
                      return otherInvestorNames.length > 0 ? (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--forest)",
                            marginTop: 1,
                          }}
                        >
                          Investor: {otherInvestorNames.join(", ")}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      background: "var(--bg-section)",
                      borderRadius: 4,
                      padding: "2px 6px",
                    }}
                  >
                    {u.status}
                  </span>
                </button>
              ))}
            </div>
          )}
          {open &&
            !investorsLoading &&
            inputValue.length > 0 &&
            suggestions.length === 0 && (
              <div
                style={{
                  position: "absolute",
                  zIndex: 50,
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  background: "var(--bg-card)",
                  border: "1.5px solid var(--border)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  fontSize: 13,
                  color: "var(--muted)",
                }}
              >
                No investors found for &ldquo;{inputValue}&rdquo;
              </div>
            )}
        </div>

        {/* Empty state */}
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
            Select an investor above to view their Capital Account Statement.
          </div>
        )}

        {loading && (
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

        {error && (
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

        {data && (
          <>
            {/* Investor name */}
            <div style={{ marginBottom: 16 }}>
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
                style={{ fontSize: 12, color: "var(--muted)", marginLeft: 10 }}
              >
                {selectedInvestor?.email}
              </span>
              {scopedInvestment && (
                <div
                  style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}
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
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  style={{
                    padding: "7px 10px",
                    fontSize: 12,
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">All Activity</option>
                  <option value="Contribution">Contributions</option>
                  <option value="Redemption">Redemptions</option>
                  <option value="Dividend">Dividends</option>
                </select>
                <input
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(e) => setFromDate(e.target.value)}
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
                  onChange={(e) => setToDate(e.target.value)}
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
                {(fromDate || toDate) && (
                  <button
                    onClick={() => {
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
                    Clear dates
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
                <table style={{ minWidth: 980 }}>
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
                          // ["ppmRefNo", "PPM Ref", "left"],
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
                            padding: "10px 14px",
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
                          <td style={{ padding: "9px 14px", fontSize: 12 }}>
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
                              padding: "9px 14px",
                              color: "var(--text-primary)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {new Date(e.date).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                          <td
                            style={{
                              padding: "9px 14px",
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
                              padding: "9px 14px",
                              fontWeight: 600,
                              color: "var(--text-primary)",
                              maxWidth: 140,
                              whiteSpace: "normal",
                              wordBreak: "break-word",
                            }}
                          >
                            {e.investorName || "—"}
                          </td>
                          <td style={{ padding: "9px 14px" }}>
                            <span
                              className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${colors.badge}`}
                            >
                              {e.entryType}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "9px 14px",
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
                                style={{ color: "var(--muted)", fontSize: 12 }}
                              >
                                —
                              </span>
                            )}
                          </td>

                          <td
                            style={{
                              padding: "9px 14px",
                              textAlign: "right",
                              color: "var(--text-primary)",
                            }}
                          >
                            {e.units != null ? e.units : "—"}
                          </td>
                          <td
                            style={{
                              padding: "9px 14px",
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
                              padding: "9px 14px",
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
                              padding: "9px 14px",
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
                                style={{ color: "var(--muted)", fontSize: 12 }}
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
                          padding: "9px 14px",
                          fontWeight: 600,
                          color: "var(--muted)",
                          fontSize: 12,
                        }}
                      >
                        {visible.length} entries
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          textAlign: "right",
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          fontSize: 13,
                        }}
                      >
                        {fmtSigned(visible.reduce((s, e) => s + e.amount, 0))}
                      </td>
                      <td
                        style={{
                          padding: "9px 14px",
                          textAlign: "right",
                          fontWeight: 700,
                          color: "#b45309",
                          fontSize: 13,
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
                          padding: "9px 14px",
                          textAlign: "right",
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          fontSize: 13,
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
    </AdminLayout>
  );
}
