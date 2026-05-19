"use client";
import { useEffect, useState } from "react";
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
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="card"
      style={{ borderTop: `3px solid ${color ?? "#699172"}` }}
    >
      <div
        style={{
          fontSize: 12,
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
          fontSize: 32,
          fontWeight: 700,
          color: "#0e3416",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trends, setTrends] = useState<DashboardTrends | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([adminApi.dashboard(), adminApi.dashboardTrends()])
      .then(([sR, tR]) => {
        if (sR.status === "fulfilled" && sR.value.success) setStats(sR.value.data);
        if (tR.status === "fulfilled" && tR.value.success) setTrends(tR.value.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}M`
      : `$${n.toLocaleString()}`;

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
            {/* Registrants & Depositors */}
            <SectionLabel>Registrants &amp; Depositors</SectionLabel>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 20,
                marginBottom: 4,
              }}
            >
              <KpiCard
                label="Total Registrants"
                value={stats.totalUsers}
                sub="All individuals in database"
                color="#0e3416"
              />
              <KpiCard
                label="Active Accounts"
                value={stats.activeInvestors}
                sub="Accounts approved by admin"
                color="#6366f1"
              />
              <KpiCard
                label="Depositors"
                value={stats.totalDepositors}
                sub="Registrants with deployed capital"
                color="#10b981"
              />
              <KpiCard
                label="Investment Files"
                value={stats.totalInvestmentFiles}
                sub="Open active investment tranches"
                color="#699172"
              />
            </div>

            {/* Pipeline */}
            <SectionLabel>Application Pipeline</SectionLabel>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 20,
                marginBottom: 4,
              }}
            >
              <KpiCard
                label="Total Applications"
                value={stats.totalApplications}
                color="#64748b"
              />
              <KpiCard
                label="Pending Reviews"
                value={stats.pendingReviews}
                sub="Awaiting admin approval"
                color="#f59e0b"
              />
              <KpiCard
                label="Pending Redemptions"
                value={stats.pendingRedemptions}
                sub="Awaiting admin approval"
                color="#ef4444"
              />
            </div>

            {/* Capital Flows */}
            <SectionLabel>Capital Flows</SectionLabel>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 20,
                marginBottom: 4,
              }}
            >
              <KpiCard
                label="Current AUM"
                value={fmt(stats.totalAUM)}
                sub={`${stats.totalUnits} active units`}
                color="#699172"
              />
              <KpiCard
                label="Total Deployed (All Time)"
                value={fmt(stats.totalDeployedCommencement)}
                sub="From commencement"
                color="#0e3416"
              />
              <KpiCard
                label="Total Withdrawn (All Time)"
                value={fmt(stats.totalWithdrawnCommencement)}
                sub="From commencement"
                color="#6366f1"
              />
              <KpiCard
                label="YTD Deployed"
                value={fmt(stats.ytdDeployed)}
                sub={`Jan 1 – today (${new Date().getFullYear()})`}
                color="#10b981"
              />
              <KpiCard
                label="YTD Withdrawn"
                value={fmt(stats.ytdWithdrawn)}
                sub={`Jan 1 – today (${new Date().getFullYear()})`}
                color="#f59e0b"
              />
            </div>

            {/* Charts */}
            {trends && (
              <>
                <SectionLabel>Analytics</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginBottom: 20 }}>
                  {/* Applications by Month */}
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

                  {/* Investor Type Breakdown */}
                  <div className="card">
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0e3416", marginBottom: 16 }}>Investor Type Breakdown</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={trends.investorTypeBreakdown} dataKey="count" nameKey="type" cx="40%" cy="50%" outerRadius={70} label={({ type, percent }) => `${type} ${Math.round((percent ?? 0) * 100)}%`} labelLine={false}>
                          {trends.investorTypeBreakdown.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 12 }} formatter={(val, name) => [val, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Monthly Capital Deployed */}
                  <div className="card">
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0e3416", marginBottom: 16 }}>Monthly Capital Deployed</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={trends.monthlyCapital} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`$${v.toLocaleString()}`, "Deployed"]} />
                        <Line type="monotone" dataKey="deployed" stroke="#699172" strokeWidth={2} dot={{ r: 4, fill: "#699172" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}

            {/* Recent Applications */}
            <div className="card" style={{ marginTop: 28 }}>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#0e3416",
                  marginBottom: 20,
                }}
              >
                Recent Applications
              </h2>
              {stats.recentApplications.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: 14 }}>
                  No applications yet.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Investor Type</th>
                      <th>Units</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentApplications.map((a) => (
                      <tr key={a.id}>
                        <td
                          style={{ fontFamily: "monospace", fontWeight: 600 }}
                        >
                          #{a.id}
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
                        <td style={{ color: "#64748b", fontSize: 13 }}>
                          {a.submittedAt
                            ? new Date(a.submittedAt).toLocaleDateString()
                            : "—"}
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
