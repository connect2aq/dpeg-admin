"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { SortableTh } from "@/components/SortableTh";
import { BankBalanceFlow } from "@/components/BankBalanceFlow";
import {
  adminApi,
  type DashboardStats,
  type DashboardTrends,
  type ApplicationListItem,
  type BankTransactionBalanceFlow,
} from "@/lib/api";
import { formatShortDate } from "@/lib/dateFormat";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type RecentAppSortField =
  | "id"
  | "accountUser"
  | "investorName"
  | "investorType"
  | "numUnits"
  | "totalAmount"
  | "status"
  | "effectiveDate"
  | "submittedAt";

const recentAppSortValue = (
  a: ApplicationListItem,
  field: RecentAppSortField,
): string | number => {
  switch (field) {
    case "id":
      return a.id;
    case "accountUser":
      return `${a.userFirstName} ${a.userLastName}`.trim().toLowerCase();
    case "investorName":
      return a.investorName?.toLowerCase() ?? "";
    case "investorType":
      return a.investorType;
    case "numUnits":
      return a.numUnits ?? -Infinity;
    case "totalAmount":
      return a.totalAmount ?? -Infinity;
    case "status":
      return a.status;
    case "effectiveDate":
      return a.effectiveDate ? new Date(a.effectiveDate).getTime() : -Infinity;
    case "submittedAt":
      return a.submittedAt ? new Date(a.submittedAt).getTime() : -Infinity;
  }
};

function KpiCard({
  label,
  value,
  sub,
  breakdown,
  color,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  breakdown?: string;
  color?: string;
  href?: string;
}) {
  const inner = (
    <div
      className="card"
      style={{
        borderTop: `3px solid ${color ?? "#699172"}`,
        cursor: href ? "pointer" : "default",
        transition: "box-shadow 0.15s",
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
      onMouseEnter={(e) => {
        if (href)
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            "0 4px 16px rgba(0,0,0,0.10)";
      }}
      onMouseLeave={(e) => {
        if (href) (e.currentTarget as HTMLDivElement).style.boxShadow = "";
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#64748b",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: "#0e3416",
          lineHeight: 1.1,
          flex: 1,
        }}
      >
        {value}
      </div>
      {breakdown && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 5 }}>
          {breakdown}
        </div>
      )}
      {sub && (
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
          {sub}
        </div>
      )}
      {href && (
        <div
          style={{
            fontSize: 11,
            color: "#699172",
            marginTop: 8,
            fontWeight: 600,
          }}
        >
          View details →
        </div>
      )}
    </div>
  );
  return href ? (
    <Link
      href={href}
      style={{ textDecoration: "none", display: "block", height: "100%" }}
    >
      {inner}
    </Link>
  ) : (
    inner
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "#94a3b8",
        marginBottom: 12,
        marginTop: 28,
      }}
    >
      {children}
    </div>
  );
}

const PIE_COLORS = ["#0e3416", "#699172", "#b8923a", "#6366f1", "#10b981"];

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trends, setTrends] = useState<DashboardTrends | null>(null);
  // Populated by BankBalanceFlow's onData so the Capital Flows KPI row below can mirror the
  // Balance Flow tile's own bank-transaction-category-driven value and click-through, instead of
  // the retired manually-entered figure.
  const [balanceFlowData, setBalanceFlowData] = useState<BankTransactionBalanceFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [recentAppSort, setRecentAppSort] =
    useState<RecentAppSortField>("submittedAt");
  const [recentAppSortDir, setRecentAppSortDir] = useState<"asc" | "desc">(
    "desc",
  );
  const toggleRecentAppSort = (field: string) => {
    const f = field as RecentAppSortField;
    if (recentAppSort === f)
      setRecentAppSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setRecentAppSort(f);
      setRecentAppSortDir("asc");
    }
  };

  const fetchDashboard = useCallback((from?: string, to?: string) => {
    setLoading(true);
    Promise.allSettled([
      adminApi.dashboard(
        from || to
          ? { from: from || undefined, to: to || undefined }
          : undefined,
      ),
      adminApi.dashboardTrends(),
    ])
      .then(([sR, tR]) => {
        if (sR.status === "fulfilled" && sR.value.success)
          setStats(sR.value.data);
        if (tR.status === "fulfilled" && tR.value.success)
          setTrends(tR.value.data);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const applyDateRange = () => {
    if (dateFrom && dateTo) fetchDashboard(dateFrom, dateTo);
  };

  const clearDateRange = () => {
    setDateFrom("");
    setDateTo("");
    fetchDashboard();
  };

  const fmt = (n: number) =>
    `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Same lookup BankBalanceFlow itself uses (see components/BankBalanceFlow.tsx getCat) — kept in
  // sync via the onData callback below rather than a second independent fetch.
  const sponsorsEquity = balanceFlowData?.categoryTotals.find(
    (c) => c.categoryName.toLowerCase() === "sponsor's equity",
  );

  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px" }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#0e3416",
            marginBottom: 6,
          }}
        >
          Dashboard
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 32 }}>
          Overview of DPEG Real Estate Fund
        </p>

        {loading ? (
          <div style={{ color: "#64748b" }}>Loading stats...</div>
        ) : stats ? (
          <>
            {/* Depositors */}
            <SectionLabel>Depositors</SectionLabel>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 20,
                marginBottom: 4,
                alignItems: "stretch",
              }}
            >
              <KpiCard
                label="Total Depositors"
                value={stats.totalDepositors}
                sub="Unique investors"
                color="#10b981"
                href="/users?filter=hasDeposit"
              />
              <KpiCard
                label="Active Depositors"
                value={stats.activeInvestors}
                sub="With current balance (not fully redeemed)"
                color="#6366f1"
                href="/users?filter=hasActiveInvestment"
              />
              <KpiCard
                label="Total Deposits"
                value={stats.totalDepositCount}
                sub="All investment tranches ever deposited"
                color="#699172"
                href="/applications?filter=deposited"
              />
              <KpiCard
                label="Active Agreements"
                value={stats.totalInvestmentFiles}
                sub="Open active investment tranches"
                color="#b8923a"
                href="/applications?status=Active"
              />
              <KpiCard
                label="Pending Reviews"
                value={stats.pendingReviews}
                sub="Applications awaiting admin approval"
                color="#f59e0b"
                href="/applications?status=UnderReview"
              />
            </div>

            {/* Date Range Filter */}
            <SectionLabel>Capital Flows — Date Range</SectionLabel>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
                flexWrap: "wrap",
              }}
            >
              <label
                style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}
              >
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  color: "#0e3416",
                }}
              />
              <label
                style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}
              >
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  color: "#0e3416",
                }}
              />
              <button
                onClick={applyDateRange}
                disabled={!dateFrom || !dateTo}
                style={{
                  fontSize: 13,
                  padding: "6px 16px",
                  border: "none",
                  borderRadius: 6,
                  background: dateFrom && dateTo ? "#0e3416" : "#e2e8f0",
                  color: dateFrom && dateTo ? "#fff" : "#94a3b8",
                  cursor: dateFrom && dateTo ? "pointer" : "default",
                  fontWeight: 600,
                  transition: "background 0.15s",
                }}
              >
                Apply
              </button>
              {(dateFrom || dateTo) && (
                <button
                  onClick={clearDateRange}
                  style={{
                    fontSize: 12,
                    padding: "6px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    background: "#f8fafc",
                    color: "#64748b",
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 20,
                marginBottom: 4,
                alignItems: "stretch",
              }}
            >
              <KpiCard
                label="Capital Raised"
                value={fmt(
                  dateFrom && dateTo
                    ? stats.totalDepositedDateRange
                    : stats.totalDeployedCommencement,
                )}
                sub={
                  dateFrom && dateTo
                    ? `${dateFrom} – ${dateTo}`
                    : "Since Inception (default)"
                }
                color="#0e3416"
                href="/capital-ledger?type=Contribution"
              />
              <KpiCard
                label="Total Redeemed"
                value={fmt(stats.totalWithdrawnDateRange)}
                sub={
                  dateFrom && dateTo
                    ? `${dateFrom} – ${dateTo}`
                    : "Since Inception (default)"
                }
                color="#6366f1"
                href="/capital-ledger?type=Redemption"
              />
              <KpiCard
                label="Dividend Paid"
                value={fmt(stats.interestPaidDateRange)}
                breakdown={`${fmt(stats.monthlyDistributionsDateRange)} monthly divs + ${fmt(stats.redemptionInterestDateRange)} on exit`}
                sub={
                  dateFrom && dateTo
                    ? `${dateFrom} – ${dateTo}`
                    : "Since Inception (default)"
                }
                color="#10b981"
                href="/capital-ledger?type=Redemption,Dividend"
              />
              <KpiCard
                label="Accrued & Unpaid"
                value={fmt(stats.totalPendingAccruals)}
                sub="Pending daily accruals, not yet distributed"
                color="#7c3aed"
                href="/daily-interest-ledger?included=false"
              />
              <KpiCard
                label="Sponsor's Equity"
                value={
                  sponsorsEquity && sponsorsEquity.count > 0
                    ? fmt(sponsorsEquity.total)
                    : "No transactions yet"
                }
                sub="From bank transactions — view in Bank Capital Ledger"
                color="#699172"
                href={
                  sponsorsEquity
                    ? `/bank-capital-ledger?category=${sponsorsEquity.categoryId}`
                    : "/bank-capital-ledger"
                }
              />
            </div>

            {/* Balance Flow */}
            <SectionLabel>Balance Flow</SectionLabel>
            <BankBalanceFlow
              onData={setBalanceFlowData}
              onViewCategory={(value) =>
                router.push(
                  value != null
                    ? `/bank-capital-ledger?category=${encodeURIComponent(value)}`
                    : "/bank-capital-ledger",
                )
              }
            />

            {/* Charts */}
            {trends && (
              <>
                <SectionLabel>Analytics</SectionLabel>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(320px, 1fr))",
                    gap: 20,
                    marginBottom: 20,
                  }}
                >
                  <div className="card">
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#0e3416",
                        marginBottom: 16,
                      }}
                    >
                      Applications by Month
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={trends.monthlyApplications}
                        margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          allowDecimals={false}
                        />
                        <Tooltip contentStyle={{ fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          dataKey="total"
                          name="Submitted"
                          fill="#c8d9cb"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          dataKey="approved"
                          name="Approved"
                          fill="#699172"
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card">
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#0e3416",
                        marginBottom: 16,
                      }}
                    >
                      Investor Type Breakdown
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <Pie
                          data={trends.investorTypeBreakdown}
                          dataKey="count"
                          nameKey="type"
                          cx="35%"
                          cy="50%"
                          outerRadius={70}
                        >
                          {trends.investorTypeBreakdown.map((_, i) => (
                            <Cell
                              key={i}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Legend
                          layout="vertical"
                          align="right"
                          verticalAlign="middle"
                          iconType="circle"
                          wrapperStyle={{ fontSize: 12 }}
                          formatter={(value: string) => {
                            const total = trends.investorTypeBreakdown.reduce(
                              (s, d) => s + d.count,
                              0,
                            );
                            const item = trends.investorTypeBreakdown.find(
                              (d) => d.type === value,
                            );
                            const pct =
                              item && total > 0
                                ? Math.round((item.count / total) * 100)
                                : 0;
                            return `${value} ${pct}%`;
                          }}
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          formatter={(val, name) => [val, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card">
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#0e3416",
                        marginBottom: 16,
                      }}
                    >
                      Monthly Deposits
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart
                        data={trends.monthlyCapital}
                        margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          tickFormatter={(v) =>
                            v >= 1_000_000
                              ? `$${(v / 1_000_000).toFixed(1)}M`
                              : `$${(v / 1000).toFixed(0)}k`
                          }
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          formatter={(v: any) => [
                            `$${Number(v).toLocaleString()}`,
                            "Deposited",
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="deployed"
                          stroke="#699172"
                          strokeWidth={2}
                          dot={{ r: 4, fill: "#699172" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card">
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#0e3416",
                        marginBottom: 16,
                      }}
                    >
                      Monthly Redemptions
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart
                        data={trends.monthlyRedemption}
                        margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          tickFormatter={(v) =>
                            v >= 1_000_000
                              ? `$${(v / 1_000_000).toFixed(1)}M`
                              : `$${(v / 1000).toFixed(0)}k`
                          }
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          formatter={(v: any) => [
                            `$${Number(v).toLocaleString()}`,
                            "Redeemed",
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="amount"
                          stroke="#ef4444"
                          strokeWidth={2}
                          dot={{ r: 4, fill: "#ef4444" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card">
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#0e3416",
                        marginBottom: 16,
                      }}
                    >
                      Monthly Deployment Trend
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart
                        data={trends.monthlyDeployment}
                        margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          tickFormatter={(v) =>
                            v >= 1_000_000
                              ? `$${(v / 1_000_000).toFixed(1)}M`
                              : `$${(v / 1000).toFixed(0)}k`
                          }
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          formatter={(v: any) => [
                            `$${Number(v).toLocaleString()}`,
                            "Deployed Amount",
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="deployedAmount"
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          dot={{ r: 4, fill: "#8b5cf6" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card">
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#0e3416",
                        marginBottom: 16,
                      }}
                    >
                      Monthly Distributions
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart
                        data={trends.monthlyDistribution}
                        margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          tickFormatter={(v) =>
                            v >= 1_000_000
                              ? `$${(v / 1_000_000).toFixed(1)}M`
                              : `$${(v / 1000).toFixed(0)}k`
                          }
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          formatter={(v: any) => [
                            `$${Number(v).toLocaleString()}`,
                            "Distributed",
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="amount"
                          stroke="#b8923a"
                          strokeWidth={2}
                          dot={{ r: 4, fill: "#b8923a" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}

            {/* Recent Applications */}
            <div className="card" style={{ marginTop: 28 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#0e3416",
                    margin: 0,
                  }}
                >
                  Recent Applications
                </h2>
                <Link
                  href="/applications"
                  style={{
                    fontSize: 13,
                    color: "#699172",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  View all →
                </Link>
              </div>
              {stats.recentApplications.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: 14 }}>
                  No applications yet.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <SortableTh
                        label="ID / REF"
                        sortKey="id"
                        sortOn={recentAppSort}
                        sortDirection={recentAppSortDir}
                        onSort={toggleRecentAppSort}
                      />
                      <SortableTh
                        label="Effective Date"
                        sortKey="effectiveDate"
                        sortOn={recentAppSort}
                        sortDirection={recentAppSortDir}
                        onSort={toggleRecentAppSort}
                      />
                      <SortableTh
                        label="Submitted"
                        sortKey="submittedAt"
                        sortOn={recentAppSort}
                        sortDirection={recentAppSortDir}
                        onSort={toggleRecentAppSort}
                      />
                      <SortableTh
                        label="Account User"
                        sortKey="accountUser"
                        sortOn={recentAppSort}
                        sortDirection={recentAppSortDir}
                        onSort={toggleRecentAppSort}
                      />
                      <SortableTh
                        label="Investor"
                        sortKey="investorName"
                        sortOn={recentAppSort}
                        sortDirection={recentAppSortDir}
                        onSort={toggleRecentAppSort}
                      />
                      <SortableTh
                        label="Type"
                        sortKey="investorType"
                        sortOn={recentAppSort}
                        sortDirection={recentAppSortDir}
                        onSort={toggleRecentAppSort}
                      />
                      <SortableTh
                        label="Units"
                        sortKey="numUnits"
                        sortOn={recentAppSort}
                        sortDirection={recentAppSortDir}
                        onSort={toggleRecentAppSort}
                      />
                      <SortableTh
                        label="Amount"
                        sortKey="totalAmount"
                        sortOn={recentAppSort}
                        sortDirection={recentAppSortDir}
                        onSort={toggleRecentAppSort}
                      />
                      <SortableTh
                        label="Status"
                        sortKey="status"
                        sortOn={recentAppSort}
                        sortDirection={recentAppSortDir}
                        onSort={toggleRecentAppSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {[...stats.recentApplications]
                      .sort((a, b) => {
                        const av = recentAppSortValue(a, recentAppSort);
                        const bv = recentAppSortValue(b, recentAppSort);
                        if (av < bv) return recentAppSortDir === "asc" ? -1 : 1;
                        if (av > bv) return recentAppSortDir === "asc" ? 1 : -1;
                        return 0;
                      })
                      .map((a) => (
                        <tr key={a.id}>
                          <td>
                            <div
                              style={{
                                fontFamily: "monospace",
                                fontWeight: 700,
                              }}
                            >
                              <Link
                                href={`/applications/${a.id}`}
                                style={{
                                  color: "#0e3416",
                                  textDecoration: "none",
                                }}
                              >
                                #{a.id}
                              </Link>
                            </div>
                            {a.ppmRefNO && (
                              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                                PPM {a.ppmRefNO}
                              </div>
                            )}
                          </td>
                          <td style={{ color: "#64748b", fontSize: 13 }}>
                            {a.effectiveDate
                              ? formatShortDate(a.effectiveDate)
                              : "—"}
                          </td>
                          <td style={{ color: "#64748b", fontSize: 13 }}>
                            {a.submittedAt
                              ? formatShortDate(a.submittedAt)
                              : "—"}
                          </td>
                          <td>
                            {a.userId ? (
                              <>
                                <div style={{ fontWeight: 600 }}>
                                  <Link
                                    href={`/users/${a.userId}`}
                                    style={{
                                      color: "#0e3416",
                                      textDecoration: "none",
                                    }}
                                  >
                                    {a.userFirstName} {a.userLastName}
                                  </Link>
                                </div>
                                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                                  {a.userEmail}
                                </div>
                              </>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>—</span>
                            )}
                          </td>
                          <td>
                            {a.investorName ? (
                              <Link
                                href={`/users/${a.userId}`}
                                style={{
                                  color: "#699172",
                                  fontWeight: 600,
                                  textDecoration: "none",
                                }}
                              >
                                {a.investorName}
                              </Link>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>—</span>
                            )}
                          </td>
                          <td>{a.investorType}</td>
                          <td>{a.numUnits ?? "—"}</td>
                          <td>
                            {a.totalAmount
                              ? `$${a.totalAmount.toLocaleString()}`
                              : "—"}
                          </td>
                          <td>
                            <StatusBadge status={a.status} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: "#ef4444" }}>Failed to load dashboard data.</div>
        )}
      </div>
    </AdminLayout>
  );
}
