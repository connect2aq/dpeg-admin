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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.dashboard().then(r => { if (r.success) setStats(r.data); }).finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${n.toLocaleString()}`;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: 6 }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>Overview of DPEG Real Estate Fund</p>

        {loading ? (
          <div style={{ color: '#64748b' }}>Loading stats...</div>
        ) : stats ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginBottom: 36 }}>
              <KpiCard label="Total Users" value={stats.totalUsers} color="#0e3416" />
              <KpiCard label="Active Investors" value={stats.activeInvestors} color="#10b981" />
              <KpiCard label="Pending Reviews" value={stats.pendingReviews} color="#f59e0b" />
              <KpiCard label="Total Applications" value={stats.totalApplications} color="#6366f1" />
              <KpiCard label="Total AUM" value={fmt(stats.totalAUM)} sub={`${stats.totalUnits} units`} color="#699172" />
              <KpiCard label="Pending Redemptions" value={stats.pendingRedemptions} color="#ef4444" />
            </div>

            <div className="card">
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
