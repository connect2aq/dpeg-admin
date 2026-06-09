'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { adminApi, type UserListItem, type PagedResult } from '@/lib/api';

const STATUSES = ['', 'InProgress', 'UnderReview', 'Active', 'Inactive', 'Test'];
const PAGE_SIZE = 20;

export default function UsersPage() {
  const [result, setResult] = useState<PagedResult<UserListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
    if (search) params.search = search;
    if (status && status !== 'Test') params.status = status;
    adminApi.users(params)
      .then(r => {
        if (r.success) {
          const items = status === 'Test' ? r.data.items.filter(u => u.isTestUser) : r.data.items;
          setResult({ ...r.data, items });
        }
      })
      .finally(() => setLoading(false));
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const onSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); load(); };

  const toggleTestUser = async (u: UserListItem) => {
    const newVal = !u.isTestUser;
    setTogglingId(u.id);
    const r = await adminApi.setUserIsTest(u.id, newVal);
    if (r.success) {
      setResult(prev => prev ? {
        ...prev,
        items: prev.items.map(item => item.id === u.id ? { ...item, isTestUser: newVal } : item),
      } : prev);
    }
    setTogglingId(null);
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: 24 }}>Users</h1>

        {/* Filters */}
        <form onSubmit={onSearch} style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            style={{ flex: '1 1 250px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
          />
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}
          >
            {STATUSES.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
          </select>
<button type="submit" className="btn-primary">Search</button>
        </form>

        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 32, color: '#64748b' }}>Loading...</div>
          ) : result ? (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Email Verified</th>
                    <th>Step</th>
                    <th>Applications</th>
                    <th>Registered</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>No users found</td></tr>
                  ) : result.items.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>
                        {u.firstName} {u.lastName}
                        {u.isTestUser && (
                          <span style={{
                            marginLeft: 8,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            background: '#fef3c7',
                            color: '#92400e',
                            border: '1px solid #fbbf24',
                            borderRadius: 4,
                            padding: '1px 5px',
                            verticalAlign: 'middle',
                          }}>TEST</span>
                        )}
                      </td>
                      <td style={{ color: '#64748b' }}>{u.email}</td>
                      <td><StatusBadge status={u.status} /></td>
                      <td>
                        <span style={{ color: u.emailVerified ? '#10b981' : '#94a3b8', fontWeight: 600, fontSize: 12 }}>
                          {u.emailVerified ? '✓ Verified' : '✗ Pending'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{u.currentOnboardingStep}/7</td>
                      <td style={{ textAlign: 'center' }}>{u.applicationCount}</td>
                      <td style={{ color: '#64748b', fontSize: 13 }}>{new Date(u.createdOn).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            onClick={() => toggleTestUser(u)}
                            disabled={togglingId === u.id}
                            title={u.isTestUser ? 'Remove test flag' : 'Mark as test user'}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              border: '1px solid',
                              cursor: togglingId === u.id ? 'not-allowed' : 'pointer',
                              background: u.isTestUser ? '#fef3c7' : 'white',
                              borderColor: u.isTestUser ? '#fbbf24' : '#e2e8f0',
                              color: u.isTestUser ? '#92400e' : '#94a3b8',
                              opacity: togglingId === u.id ? 0.6 : 1,
                            }}
                          >
                            Test
                          </button>
                          <Link href={`/users/${u.id}`} style={{ color: '#699172', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                            View →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  {result.totalCount} users · Page {result.page} of {result.totalPages}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '8px 16px', fontSize: 13 }}>← Prev</button>
                  <button className="btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page >= result.totalPages} style={{ padding: '8px 16px', fontSize: 13 }}>Next →</button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 32, color: '#ef4444' }}>Failed to load users.</div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
