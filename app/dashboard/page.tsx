"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { adminApi, type DashboardStats, type DashboardTrends } from "@/lib/api";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

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
      onMouseEnter={e => { if (href) (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)"; }}
      onMouseLeave={e => { if (href) (e.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#0e3416", lineHeight: 1.1, flex: 1 }}>
        {value}
      </div>
      {breakdown && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 5 }}>{breakdown}</div>}
      {sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{sub}</div>}
      {href && <div style={{ fontSize: 11, color: "#699172", marginTop: 8, fontWeight: 600 }}>View details →</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none", display: "block", height: "100%" }}>{inner}</Link> : inner;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 12, marginTop: 28 }}>
      {children}
    </div>
  );
}

function BalanceFlow({ stats }: { stats: DashboardStats }) {
  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const remaining           = stats.totalDeployedCommencement - stats.totalWithdrawnCommencement;
  const afterDividend       = remaining - stats.interestPaidCommencement;
  const hasDeployed          = stats.deployedAmount != null;
  const hasInterestReceived  = stats.interestReceived != null;
  const hasDividendReceived  = stats.dividendReceived != null;
  const hasOtherCharges      = stats.otherCharges != null;
  // Balance Available = after dividends − deployed + interest received + dividend received − other charges
  const available = hasDeployed
    ? afterDividend
        - (stats.deployedAmount ?? 0)
        + (hasInterestReceived ? (stats.interestReceived ?? 0) : 0)
        + (hasDividendReceived ? (stats.dividendReceived ?? 0) : 0)
        - (hasOtherCharges ? (stats.otherCharges ?? 0) : 0)
    : null;
  const hasBank  = stats.bankAccountBalance != null;
  const variance = hasDeployed && hasBank ? (stats.bankAccountBalance ?? 0) - (available ?? 0) : null;

  const boxStyle = (accent: string, muted?: boolean, clickable?: boolean): React.CSSProperties => ({
    background: muted ? "#f8fafc" : "#fff",
    border: `1px solid ${muted ? "#e2e8f0" : "#cbd5e1"}`,
    borderTop: `3px solid ${accent}`,
    borderRadius: 8,
    padding: "12px 14px",
    opacity: muted ? 0.65 : 1,
    cursor: clickable ? "pointer" : "default",
    transition: "box-shadow 0.15s",
    height: "100%",
    boxSizing: "border-box" as const,
    display: "flex",
    flexDirection: "column" as const,
  });

  const arrowStyle = (color: string, muted?: boolean, clickable?: boolean): React.CSSProperties => ({
    background: muted ? "#f8fafc" : `${color}0d`,
    border: `1px solid ${muted ? "#e2e8f0" : `${color}40`}`,
    borderTop: `3px solid ${muted ? "#e2e8f0" : color}`,
    borderRadius: 8,
    padding: "12px 14px",
    opacity: muted ? 0.65 : 1,
    cursor: clickable ? "pointer" : "default",
    transition: "box-shadow 0.15s",
    height: "100%",
    boxSizing: "border-box" as const,
    display: "flex",
    flexDirection: "column" as const,
  });

  const hover = (href?: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => { if (href) e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)"; },
    onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => { if (href) e.currentTarget.style.boxShadow = ""; },
  });

  const box = (label: string, value: string, accent: string, muted?: boolean, href?: string, sub?: string) => {
    const inner = (
      <div style={boxStyle(accent, muted, !!href)} {...hover(href)}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: muted ? "#94a3b8" : "#0e3416", flex: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{sub}</div>}
        {href && <div style={{ fontSize: 10, color: "#699172", marginTop: 6, fontWeight: 600 }}>View details →</div>}
      </div>
    );
    return href ? <Link href={href} style={{ textDecoration: "none", display: "block", height: "100%" }}>{inner}</Link> : inner;
  };

  const arrow = (label: string, amount: string, color: string, muted?: boolean, href?: string, sub?: string) => {
    const inner = (
      <div style={arrowStyle(color, muted, !!href)} {...hover(href)}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: muted ? "#94a3b8" : color, marginBottom: 6 }}>→ {label}</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: muted ? "#94a3b8" : color, flex: 1 }}>{amount}</div>
        {sub && <div style={{ fontSize: 10, color: muted ? "#94a3b8" : `${color}cc`, marginTop: 4 }}>{sub}</div>}
        {href && <div style={{ fontSize: 10, color: "#699172", marginTop: 6, fontWeight: 600 }}>View details →</div>}
      </div>
    );
    return href ? <Link href={href} style={{ textDecoration: "none", display: "block", height: "100%" }}>{inner}</Link> : inner;
  };

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "20px 24px", marginBottom: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#0e3416", marginBottom: 16 }}>
        Balance Flow (Since Inception){stats.balanceAsAtDate && ` — Balance as at ${new Date(stats.balanceAsAtDate).toLocaleDateString()}`}
      </div>
      {/* 3 rows × 4 columns — all cards same width and height */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, alignItems: "stretch" }}>
        {/* Row 1 */}
        {box("Total Deposits to Date",   fmt(stats.totalDeployedCommencement),       "#0e3416", false, "/capital-ledger?type=Contribution")}
        {arrow("Redeemed",               `−${fmt(stats.totalWithdrawnCommencement)}`, "#ef4444", false, "/capital-ledger?type=Redemption")}
        {box("Balance Remaining",        fmt(remaining),                              "#6366f1")}
        {arrow("Dividend Paid",          `−${fmt(stats.interestPaidCommencement)}`,   "#f59e0b", false, "/capital-ledger?type=Redemption,Dividend",
          `${fmt(stats.monthlyDistributionsCommencement)} monthly divs + ${fmt(stats.redemptionInterestCommencement)} on exit`)}

        {/* Row 2 */}
        {box("After Dividends",          fmt(afterDividend),                          "#10b981")}
        {hasDeployed
          ? arrow("Deployed",            `−${fmt(stats.deployedAmount ?? 0)}`,        "#8b5cf6", false, "/settings")
          : arrow("Deployed",            "Pending",                                   "#8b5cf6", true,  "/settings")}
        {box("Dividend Received",           hasDividendReceived ? fmt(stats.dividendReceived ?? 0) : "Not entered",  "#b8923a", !hasDividendReceived, "/settings")}
        {box("Interest Received from Bank", hasInterestReceived ? fmt(stats.interestReceived ?? 0) : "Not entered",  "#0f2342", !hasInterestReceived, "/settings")}

        {/* Row 3 */}
        {arrow("Other Charges / Expenses",   hasOtherCharges ? `−${fmt(stats.otherCharges ?? 0)}` : "Not entered",    "#ef4444", !hasOtherCharges,      "/settings")}
        {hasDeployed
          ? box("Total Balance Available", fmt(available ?? 0),                       "#699172")
          : box("Total Balance Available", "Not entered",                             "#b8923a", true)}
        {hasBank && variance != null
          ? arrow("Variance",            `${variance >= 0 ? "+" : "−"}${fmt(Math.abs(variance))}`, variance >= 0 ? "#10b981" : "#ef4444")
          : arrow("Variance",            "N/A",                                                     "#94a3b8", true)}
        {hasBank
          ? box("Bank Account Balance",  fmt(stats.bankAccountBalance ?? 0),          "#64748b", false, "/settings")
          : box("Bank Account Balance",  "Not entered",                               "#64748b", true,  "/settings")}
      </div>
      {!hasDeployed && (
        <div style={{ fontSize: 11, color: "#b8923a", marginTop: 10 }}>
          ⚠ Enter today&apos;s Deployed Amount in Admin → Settings → Daily Balances to complete this flow.
        </div>
      )}
    </div>
  );
}

const PIE_COLORS = ["#0e3416", "#699172", "#b8923a", "#6366f1", "#10b981"];

export default function DashboardPage() {
  const [stats, setStats]     = useState<DashboardStats | null>(null);
  const [trends, setTrends]   = useState<DashboardTrends | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");

  const fetchDashboard = useCallback((from?: string, to?: string) => {
    setLoading(true);
    Promise.allSettled([
      adminApi.dashboard(from || to ? { from: from || undefined, to: to || undefined } : undefined),
      adminApi.dashboardTrends(),
    ])
      .then(([sR, tR]) => {
        if (sR.status === "fulfilled" && sR.value.success) setStats(sR.value.data);
        if (tR.status === "fulfilled" && tR.value.success) setTrends(tR.value.data);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const applyDateRange = () => {
    if (dateFrom && dateTo) fetchDashboard(dateFrom, dateTo);
  };

  const clearDateRange = () => {
    setDateFrom("");
    setDateTo("");
    fetchDashboard();
  };

  const fmt = (n: number) =>
    `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0e3416", marginBottom: 6 }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 32 }}>Overview of DPEG Real Estate Fund</p>

        {loading ? (
          <div style={{ color: "#64748b" }}>Loading stats...</div>
        ) : stats ? (
          <>
            {/* Depositors */}
            <SectionLabel>Depositors</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 20, marginBottom: 4, alignItems: "stretch" }}>
              <KpiCard label="Total Depositors" value={stats.totalDepositors} sub="Unique investors with active capital" color="#10b981" href="/users?filter=hasDeposit" />
              <KpiCard label="Active Depositors" value={stats.activeInvestors} sub="With current balance (not fully redeemed)" color="#6366f1" href="/users?filter=hasActiveInvestment" />
              <KpiCard label="Total Deposits" value={stats.totalDepositCount} sub="All investment tranches ever deposited" color="#699172" href="/applications?filter=deposited" />
              <KpiCard label="Active Agreements" value={stats.totalInvestmentFiles} sub="Open active investment tranches" color="#b8923a" href="/applications?status=Active" />
              <KpiCard label="Pending Reviews" value={stats.pendingReviews} sub="Applications awaiting admin approval" color="#f59e0b" href="/applications?status=UnderReview" />
            </div>

            {/* Date Range Filter */}
            <SectionLabel>Capital Flows — Date Range</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                style={{ fontSize: 13, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, color: "#0e3416" }}
              />
              <label style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                style={{ fontSize: 13, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, color: "#0e3416" }}
              />
              <button
                onClick={applyDateRange}
                disabled={!dateFrom || !dateTo}
                style={{ fontSize: 13, padding: "6px 16px", border: "none", borderRadius: 6, background: dateFrom && dateTo ? "#0e3416" : "#e2e8f0", color: dateFrom && dateTo ? "#fff" : "#94a3b8", cursor: dateFrom && dateTo ? "pointer" : "default", fontWeight: 600, transition: "background 0.15s" }}
              >
                Apply
              </button>
              {(dateFrom || dateTo) && (
                <button
                  onClick={clearDateRange}
                  style={{ fontSize: 12, padding: "6px 12px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#f8fafc", color: "#64748b", cursor: "pointer" }}
                >
                  Clear
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 4, alignItems: "stretch" }}>
              <KpiCard
                label="Capital Raised"
                value={fmt(dateFrom && dateTo ? stats.totalDepositedDateRange : stats.totalDeployedCommencement)}
                sub={dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : "Since Inception (default)"}
                color="#0e3416"
                href="/capital-ledger?type=Contribution"
              />
              <KpiCard
                label="Total Redeemed"
                value={fmt(stats.totalWithdrawnDateRange)}
                sub={dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : "Since Inception (default)"}
                color="#6366f1"
                href="/capital-ledger?type=Redemption"
              />
              <KpiCard
                label="Dividend Paid"
                value={fmt(stats.interestPaidDateRange)}
                breakdown={`${fmt(stats.monthlyDistributionsDateRange)} monthly divs + ${fmt(stats.redemptionInterestDateRange)} on exit`}
                sub={dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : "Since Inception (default)"}
                color="#10b981"
                href="/capital-ledger?type=Redemption,Dividend"
              />
            </div>

            {/* Balance Flow */}
            <SectionLabel>Balance Flow</SectionLabel>
            <BalanceFlow stats={stats} />

            {/* Charts */}
            {trends && (
              <>
                <SectionLabel>Analytics</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginBottom: 20 }}>
                  <div className="card">
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0e3416", marginBottom: 16 }}>Applications by Month</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={trends.monthlyApplications} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="total" name="Submitted" fill="#c8d9cb" radius={[3,3,0,0]} />
                        <Bar dataKey="approved" name="Approved" fill="#699172" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card">
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0e3416", marginBottom: 16 }}>Investor Type Breakdown</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={trends.investorTypeBreakdown} dataKey="count" nameKey="type" cx="40%" cy="50%" outerRadius={70} label={({ type, percent }: any) => `${type} ${Math.round((percent ?? 0) * 100)}%`} labelLine={false}>
                          {trends.investorTypeBreakdown.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 12 }} formatter={(val, name) => [val, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card">
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0e3416", marginBottom: 16 }}>Monthly Deposits</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={trends.monthlyCapital} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Deployed"]} />
                        <Line type="monotone" dataKey="deployed" stroke="#699172" strokeWidth={2} dot={{ r: 4, fill: "#699172" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}

            {/* Recent Applications */}
            <div className="card" style={{ marginTop: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0e3416", margin: 0 }}>Recent Applications</h2>
                <Link href="/applications" style={{ fontSize: 13, color: "#699172", fontWeight: 600, textDecoration: "none" }}>View all →</Link>
              </div>
              {stats.recentApplications.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: 14 }}>No applications yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Investor</th>
                      <th>Type</th>
                      <th>Units</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentApplications.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontFamily: "monospace", fontWeight: 600 }}>
                          <Link href={`/applications/${a.id}`} style={{ color: "#0e3416", textDecoration: "none" }}>#{a.id}</Link>
                        </td>
                        <td>
                          {a.userId && a.investorName ? (
                            <Link href={`/users/${a.userId}`} style={{ color: "#699172", fontWeight: 600, textDecoration: "none" }}>{a.investorName}</Link>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>—</span>
                          )}
                        </td>
                        <td>{a.investorType}</td>
                        <td>{a.numUnits ?? "—"}</td>
                        <td>{a.totalAmount ? `$${a.totalAmount.toLocaleString()}` : "—"}</td>
                        <td><StatusBadge status={a.status} /></td>
                        <td style={{ color: "#64748b", fontSize: 13 }}>
                          {a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : "—"}
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
