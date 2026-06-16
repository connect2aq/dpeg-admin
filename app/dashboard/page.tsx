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
  color,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
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
      }}
      onMouseEnter={e => { if (href) (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)"; }}
      onMouseLeave={e => { if (href) (e.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: "#0e3416", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>{sub}</div>}
      {href && <div style={{ fontSize: 11, color: "#699172", marginTop: 8, fontWeight: 600 }}>View details →</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 12, marginTop: 28 }}>
      {children}
    </div>
  );
}

function BalanceFlow({ stats }: { stats: DashboardStats }) {
  const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${n.toLocaleString()}`;
  const remaining     = stats.totalDeployedCommencement - stats.totalWithdrawnCommencement;
  const afterInterest = remaining - stats.interestPaidCommencement;
  const hasDeployed   = stats.deployedAmount != null;
  const available     = hasDeployed ? afterInterest - (stats.deployedAmount ?? 0) : null;

  const box = (label: string, value: string, accent: string, muted?: boolean) => (
    <div style={{
      background: muted ? "#f8fafc" : "#fff",
      border: `1px solid ${muted ? "#e2e8f0" : "#cbd5e1"}`,
      borderTop: `3px solid ${accent}`,
      borderRadius: 8,
      padding: "14px 18px",
      minWidth: 130,
      flex: "1 1 130px",
      opacity: muted ? 0.65 : 1,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: muted ? "#94a3b8" : "#0e3416" }}>{value}</div>
    </div>
  );

  const arrow = (label: string, amount: string, color: string, muted?: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 4px", flexShrink: 0, gap: 6 }}>
      <span style={{ fontSize: 16, color: "#cbd5e1" }}>→</span>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        background: muted ? "#f1f5f9" : `${color}1a`,
        border: `1px solid ${muted ? "#e2e8f0" : `${color}40`}`,
        borderRadius: 999,
        padding: "4px 12px",
        whiteSpace: "nowrap",
      }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: muted ? "#94a3b8" : color }}>
          {label}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: muted ? "#94a3b8" : color }}>
          {amount}
        </span>
      </div>
    </div>
  );

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "20px 24px", marginBottom: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#0e3416", marginBottom: 16 }}>
        Balance Flow (Since Inception){stats.balanceAsAtDate && ` — Balance as at ${new Date(stats.balanceAsAtDate).toLocaleDateString()}`}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {box("Total Deposits", fmt(stats.totalDeployedCommencement), "#0e3416")}
        {arrow("Redeemed", `−${fmt(stats.totalWithdrawnCommencement)}`, "#ef4444")}
        {box("Remaining", fmt(remaining), "#6366f1")}
        {arrow("Interest Paid", `−${fmt(stats.interestPaidCommencement)}`, "#f59e0b")}
        {box("After Interest", fmt(afterInterest), "#10b981")}
        {arrow("Deployed", hasDeployed ? `−${fmt(stats.deployedAmount ?? 0)}` : "Pending", "#8b5cf6", !hasDeployed)}
        {hasDeployed
          ? box("Available", fmt(available ?? 0), "#699172")
          : box("Available", "Not entered", "#b8923a", true)}
        {!hasDeployed && (
          <div style={{ fontSize: 11, color: "#b8923a", alignSelf: "flex-end", paddingBottom: 4, flexBasis: "100%", marginTop: 8 }}>
            ⚠ Enter today&apos;s Deployed Amount in Admin → Settings → Daily Balances to complete this flow.
          </div>
        )}
      </div>
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

  const handleDateChange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    if (from && to) fetchDashboard(from, to);
    else if (!from && !to) fetchDashboard();
  };

  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${n.toLocaleString()}`;

  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0e3416", marginBottom: 6 }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 32 }}>Overview of DPEG Real Estate Fund</p>

        {loading ? (
          <div style={{ color: "#64748b" }}>Loading stats...</div>
        ) : stats ? (
          <>
            {/* Registrants & Depositors */}
            <SectionLabel>Registrants &amp; Depositors</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20, marginBottom: 4 }}>
              <KpiCard label="Total Registrants" value={stats.totalUsers} sub="All individuals in database" color="#0e3416" href="/users" />
              <KpiCard label="Active Depositors" value={stats.activeInvestors} sub="Accounts approved by admin" color="#6366f1" href="/users?status=Active" />
              <KpiCard label="Total Depositors to Date" value={stats.totalDepositors} sub="Unique investors with active capital" color="#10b981" href="/applications?status=Active" />
              <KpiCard label="Total Number of Deposits" value={stats.totalDepositCount} sub="All investment tranches ever deposited" color="#699172" href="/applications" />
              <KpiCard label="Investment Files" value={stats.totalInvestmentFiles} sub="Open active investment tranches" color="#b8923a" href="/applications?status=Active" />
            </div>

            {/* Pipeline */}
            <SectionLabel>Application Pipeline</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20, marginBottom: 4 }}>
              <KpiCard label="Total Applications" value={stats.totalApplications} color="#64748b" href="/applications" />
              <KpiCard label="Pending Reviews" value={stats.pendingReviews} sub="Awaiting admin approval" color="#f59e0b" href="/applications?status=UnderReview" />
              <KpiCard label="Pending Redemptions" value={stats.pendingRedemptions} sub="Awaiting admin approval" color="#ef4444" href="/redemptions?status=UnderReview" />
            </div>

            {/* Capital Flows */}
            <SectionLabel>Capital Flows — All Time (Since Inception)</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginBottom: 4 }}>
              <KpiCard label="Current AUM" value={fmt(stats.totalAUM)} sub={`${stats.totalUnits} active units`} color="#699172" href="/applications?status=Active" />
              <KpiCard label="Total Deposit Amount" value={fmt(stats.totalDeployedCommencement)} sub="From commencement" color="#0e3416" href="/applications?status=Active" />
              <KpiCard label="Total Redeemed Amount" value={fmt(stats.totalWithdrawnCommencement)} sub="From commencement" color="#6366f1" href="/redemptions?status=Active" />
              <KpiCard label="Interest Paid to Date" value={fmt(stats.interestPaidCommencement)} sub="All distribution payments made" color="#10b981" href="/distributions" />
              {stats.deployedAmount != null && (
                <KpiCard label="Deployed in Projects" value={fmt(stats.deployedAmount)} sub={stats.balanceAsAtDate ? `As at ${new Date(stats.balanceAsAtDate).toLocaleDateString()}` : "Currently deployed externally"} color="#b8923a" href="/settings" />
              )}
              {stats.bankAccountBalance != null && (
                <KpiCard label="Bank Account Balance" value={fmt(stats.bankAccountBalance)} sub={stats.balanceAsAtDate ? `As at ${new Date(stats.balanceAsAtDate).toLocaleDateString()}` : "As at last update"} color="#64748b" href="/settings" />
              )}
            </div>

            {/* Date Range Filter */}
            <SectionLabel>Capital Flows — Date Range</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => handleDateChange(e.target.value, dateTo)}
                style={{ fontSize: 13, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, color: "#0e3416" }}
              />
              <label style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => handleDateChange(dateFrom, e.target.value)}
                style={{ fontSize: 13, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, color: "#0e3416" }}
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => handleDateChange("", "")}
                  style={{ fontSize: 12, padding: "6px 12px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#f8fafc", color: "#64748b", cursor: "pointer" }}
                >
                  Clear
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginBottom: 4 }}>
              <KpiCard
                label="Total Deposits (Range)"
                value={fmt(stats.totalDepositedDateRange)}
                sub={dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : "YTD (default)"}
                color="#0e3416"
                href="/applications?status=Active"
              />
              <KpiCard
                label="Total Redeemed (Range)"
                value={fmt(stats.totalWithdrawnDateRange)}
                sub={dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : "YTD (default)"}
                color="#6366f1"
                href="/redemptions?status=Active"
              />
              <KpiCard
                label="Interest Paid (Range)"
                value={fmt(stats.interestPaidDateRange)}
                sub={dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : "YTD (default)"}
                color="#10b981"
                href="/distributions"
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
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0e3416", marginBottom: 16 }}>Monthly Capital Deployed</div>
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
