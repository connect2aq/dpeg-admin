'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { adminApi, type UserDetail } from '@/lib/api';

const STATUSES = ['InProgress', 'UnderReview', 'Active', 'Inactive'];

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [togglingTest, setTogglingTest] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [msg, setMsg] = useState('');
  const [testMsg, setTestMsg] = useState('');

  useEffect(() => {
    adminApi.user(Number(id))
      .then(r => { if (r.success) { setUser(r.data); setNewStatus(r.data.status); } })
      .finally(() => setLoading(false));
  }, [id]);

  const updateStatus = async () => {
    if (!user || newStatus === user.status) return;
    setUpdating(true);
    const r = await adminApi.updateUserStatus(user.id, newStatus);
    setMsg(r.success ? 'Status updated.' : r.message);
    if (r.success) setUser(u => u ? { ...u, status: newStatus } : u);
    setUpdating(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const toggleTestUser = async () => {
    if (!user) return;
    const newVal = !user.isTestUser;
    setTogglingTest(true);
    const r = await adminApi.setUserIsTest(user.id, newVal);
    setTestMsg(r.success ? r.data : r.message);
    if (r.success) setUser(u => u ? { ...u, isTestUser: newVal } : u);
    setTogglingTest(false);
    setTimeout(() => setTestMsg(''), 3000);
  };

  if (loading) return <AdminLayout><div style={{ padding: 40, color: '#64748b' }}>Loading...</div></AdminLayout>;
  if (!user) return <AdminLayout><div style={{ padding: 40 }}><p style={{ color: '#ef4444' }}>User not found.</p></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px', maxWidth: 900 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
          <Link href="/users" style={{ color: '#b8923a', textDecoration: 'none' }}>Users</Link> / {user.firstName} {user.lastName}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f2342' }}>{user.firstName} {user.lastName}</h1>
              {user.isTestUser && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  background: '#fef3c7',
                  color: '#92400e',
                  border: '1px solid #fbbf24',
                  borderRadius: 4,
                  padding: '2px 8px',
                }}>TEST USER</span>
              )}
            </div>
            <p style={{ color: '#64748b', marginTop: 4 }}>{user.email}</p>
          </div>
          <StatusBadge status={user.status} />
        </div>

        {/* Status update */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 16 }}>Update Status</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value)}
              style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn-primary" onClick={updateStatus} disabled={updating || newStatus === user.status}>
              {updating ? 'Updating...' : 'Apply'}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg.includes('updated') ? '#10b981' : '#ef4444' }}>{msg}</span>}
          </div>
        </div>

        {/* Test user flag */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 8 }}>Test User</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
            Test users are excluded from dashboard statistics, reports, and Excel exports.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={toggleTestUser}
              disabled={togglingTest}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                border: '1.5px solid',
                cursor: togglingTest ? 'not-allowed' : 'pointer',
                background: user.isTestUser ? '#fef3c7' : 'white',
                borderColor: user.isTestUser ? '#fbbf24' : '#e2e8f0',
                color: user.isTestUser ? '#92400e' : '#475569',
              }}
            >
              {togglingTest ? 'Saving...' : user.isTestUser ? 'Remove test flag' : 'Mark as test user'}
            </button>
            {testMsg && (
              <span style={{ fontSize: 13, color: '#10b981' }}>{testMsg}</span>
            )}
          </div>
        </div>

        {/* User info */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 16 }}>Account Details</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              ['Email Verified', user.emailVerified ? '✓ Yes' : '✗ No'],
              ['Onboarding Step', `${user.currentOnboardingStep} / 7`],
              ['Applications', String(user.applicationCount)],
              ['Registered', new Date(user.createdOn).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 4 }}>{k}</div>
                <div style={{ fontSize: 15, color: '#1a1a2e', fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Applications */}
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 16 }}>Applications ({user.applications.length})</h2>
          {user.applications.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No applications submitted yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Units</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {user.applications.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>#{a.id}</td>
                    <td>{a.investorType}</td>
                    <td>{a.numUnits ?? '—'}</td>
                    <td>{a.totalAmount ? `$${a.totalAmount.toLocaleString()}` : '—'}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td style={{ color: '#64748b', fontSize: 13 }}>{a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '—'}</td>
                    <td>
                      <Link href={`/applications/${a.id}`} style={{ color: '#b8923a', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
