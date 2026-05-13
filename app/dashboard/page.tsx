'use client';
import { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { adminApi, type DashboardStats } from '@/lib/api';

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${color ?? '#699172'}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#0e3416', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 12, marginTop: 28 }}>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.dashboard().then(r => { if (r.success) setStats(r.data); }).finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${n.toLocaleString()}`;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: 6 }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>Overview of DPEG Real Estate Fund</p>

        {loading ? (
          <div style={{ color: '#64748b' }}>Loading stats...</div>
        ) : stats ? (
          <>
            {/* Registrants & Depositors */}
            <SectionLabel>Registrants &amp; Depositors</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginBottom: 4 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginBottom: 4 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 4 }}>
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

            {/* Recent Applications */}
            <div className="card" style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0e3416', marginBottom: 20 }}>Recent Applications</h2>
              {stats.recentApplications.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 14 }}>No applications yet.</p>
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
                    {stats.recentApplications.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>#{a.id}</td>
                        <td>{a.investorType}</td>
                        <td>{a.numUnits ?? '—'}</td>
                        <td>{a.totalAmount ? `$${a.totalAmount.toLocaleString()}` : '—'}</td>
                        <td><StatusBadge status={a.status} /></td>
                        <td style={{ color: '#64748b', fontSize: 13 }}>{a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: '#ef4444' }}>Failed to load dashboard data.</div>
        )}
      </div>
    </AdminLayout>
  );
}
