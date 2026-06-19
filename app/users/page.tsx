'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { adminApi, type UserListItem, type PagedResult, type CreateUserAdminRequest } from '@/lib/api';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

const STATUSES = ['', 'InProgress', 'UnderReview', 'Active', 'Inactive', 'Test'];
const PAGE_SIZE = 20;

const emptyCreateForm: CreateUserAdminRequest = { firstName: '', lastName: '', email: '', password: '' };

export default function UsersPage() {
  return (
    <Suspense fallback={<AdminLayout><div className="page-content" style={{ padding: 32, color: '#64748b' }}>Loading...</div></AdminLayout>}>
      <UsersContent />
    </Suspense>
  );
}

function UsersContent() {
  const { user: authUser } = useAdminAuth();
  const isSuperAdmin = (authUser?.adminRole ?? 'SuperAdmin') === 'SuperAdmin';
  const searchParams = useSearchParams();
  const [result, setResult] = useState<PagedResult<UserListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '');
  const [neverApplied] = useState(() => searchParams.get('filter') === 'neverApplied');
  const [page, setPage] = useState(1);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'investors' | 'admins'>('investors');

  // Multi-select state
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState('');

  // Create user state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserAdminRequest>(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
    if (search) params.search = search;
    if (status && status !== 'Test') params.status = status;
    if (viewMode === 'admins') params.isAdmin = 'true';
    if (neverApplied) params.neverApplied = 'true';
    adminApi.users(params)
      .then(r => {
        if (r.success) {
          const items = status === 'Test' ? r.data.items.filter(u => u.isTestUser) : r.data.items;
          setResult({ ...r.data, items });
        }
      })
      .finally(() => setLoading(false));
  }, [page, search, status, viewMode]);

  useEffect(() => { load(); }, [load]);

  const switchView = (mode: 'investors' | 'admins') => {
    setViewMode(mode);
    setPage(1);
    setSelected(new Set());
  };

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

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!result) return;
    const allIds = result.items.map(u => u.id);
    const allSelected = allIds.every(id => selected.has(id));
    if (allSelected) {
      setSelected(prev => { const next = new Set(prev); allIds.forEach(id => next.delete(id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); allIds.forEach(id => next.add(id)); return next; });
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteMsg('');
    const r = await adminApi.bulkDeleteUsers(Array.from(selected));
    if (r.success) {
      setSelected(new Set());
      setShowDeleteConfirm(false);
      if (isSuperAdmin) load();
      else setDeleteMsg(`Change submitted for approval — ${r.message}`);
    } else {
      setDeleteMsg(r.message || 'Delete failed.');
    }
    setDeleting(false);
  };

  const submitCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateMsg('');
    const r = await adminApi.createUser(createForm);
    if (r.success) {
      setShowCreateModal(false);
      setCreateForm(emptyCreateForm);
      load();
    } else {
      setCreateMsg(r.message || 'Failed to create user.');
    }
    setCreating(false);
  };

  const allOnPageSelected = result ? result.items.length > 0 && result.items.every(u => selected.has(u.id)) : false;
  const someOnPageSelected = result ? result.items.some(u => selected.has(u.id)) : false;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: neverApplied ? 8 : 16 }}>Users</h1>
        {neverApplied && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ background: '#f1f5f9', border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '5px 12px', fontSize: 13, color: '#475569', fontWeight: 600 }}>
              Filter: Never Applied — registered users with no application submitted
            </span>
            <a href="/users" style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'underline' }}>Clear filter</a>
          </div>
        )}

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['investors', 'admins'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => switchView(mode)}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                border: viewMode === mode ? '1.5px solid #0e3416' : '1.5px solid #e2e8f0',
                background: viewMode === mode ? '#0e3416' : 'white',
                color: viewMode === mode ? 'white' : '#64748b',
              }}
            >
              {mode === 'investors' ? 'Investors' : 'Admin Users'}
            </button>
          ))}
        </div>

        {/* Filters */}
        <form onSubmit={onSearch} style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
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

        {/* Action toolbar */}
        {viewMode === 'investors' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            <button
              className="btn-primary"
              onClick={() => { setCreateForm(emptyCreateForm); setCreateMsg(''); setShowCreateModal(true); }}
              style={{ fontSize: 13 }}
            >
              + Create User
            </button>
            {selected.size > 0 && (
              <button
                onClick={() => { setDeleteMsg(''); setShowDeleteConfirm(true); }}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6,
                  background: '#fee2e2', color: '#b91c1c', border: '1.5px solid #fca5a5', cursor: 'pointer',
                }}
              >
                Delete Selected ({selected.size})
              </button>
            )}
          </div>
        )}
        {viewMode === 'admins' && (
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            Admin accounts manage the portal itself (Maker / Checker / Approver / SuperAdmin). Click into a row to change role or reset password.
          </p>
        )}

        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 32, color: '#64748b' }}>Loading...</div>
          ) : result ? (
            <>
              <table>
                <thead>
                  <tr>
                    {viewMode === 'investors' && (
                      <th style={{ width: 40, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={allOnPageSelected}
                          ref={el => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }}
                          onChange={toggleSelectAll}
                        />
                      </th>
                    )}
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    {viewMode === 'investors' ? (
                      <>
                        <th>Email Verified</th>
                        <th>Step</th>
                        <th>Applications</th>
                      </>
                    ) : (
                      <th>Admin Role</th>
                    )}
                    <th>Registered</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.length === 0 ? (
                    <tr><td colSpan={viewMode === 'investors' ? 9 : 6} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>No users found</td></tr>
                  ) : result.items.map(u => (
                    <tr key={u.id} style={{ background: selected.has(u.id) ? '#fef9ec' : undefined }}>
                      {viewMode === 'investors' && (
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selected.has(u.id)}
                            onChange={() => toggleSelect(u.id)}
                          />
                        </td>
                      )}
                      <td style={{ fontWeight: 600 }}>
                        {u.firstName} {u.lastName}
                        {u.isTestUser && (
                          <span style={{
                            marginLeft: 8, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.05em', background: '#fef3c7', color: '#92400e',
                            border: '1px solid #fbbf24', borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle',
                          }}>TEST</span>
                        )}
                      </td>
                      <td style={{ color: '#64748b' }}>{u.email}</td>
                      <td><StatusBadge status={u.status} /></td>
                      {viewMode === 'investors' ? (
                        <>
                          <td>
                            <span style={{ color: u.emailVerified ? '#10b981' : '#94a3b8', fontWeight: 600, fontSize: 12 }}>
                              {u.emailVerified ? '✓ Verified' : '✗ Pending'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>{u.currentOnboardingStep}/7</td>
                          <td style={{ textAlign: 'center' }}>{u.applicationCount}</td>
                        </>
                      ) : (
                        <td>
                          <span style={{
                            padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '0.03em',
                            background: '#e0e7ff', color: '#3730a3',
                          }}>{u.adminRole ?? '—'}</span>
                        </td>
                      )}
                      <td style={{ color: '#64748b', fontSize: 13 }}>{new Date(u.createdOn).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {viewMode === 'investors' && (
                          <button
                            onClick={() => toggleTestUser(u)}
                            disabled={togglingId === u.id}
                            title={u.isTestUser ? 'Remove test flag' : 'Mark as test user'}
                            style={{
                              padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                              textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid',
                              cursor: togglingId === u.id ? 'not-allowed' : 'pointer',
                              background: u.isTestUser ? '#fef3c7' : 'white',
                              borderColor: u.isTestUser ? '#fbbf24' : '#e2e8f0',
                              color: u.isTestUser ? '#92400e' : '#94a3b8',
                              opacity: togglingId === u.id ? 0.6 : 1,
                            }}
                          >
                            Test
                          </button>
                          )}
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

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f2342', marginBottom: 12 }}>Delete {selected.size} User{selected.size !== 1 ? 's' : ''}?</h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>
              This will permanently delete the selected user{selected.size !== 1 ? 's' : ''} and all associated data (investments, redemptions, distributions, interest logs, etc.).
            </p>
            <p style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600, marginBottom: 20 }}>This action cannot be undone.</p>
            {deleteMsg && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{deleteMsg}</p>}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{ padding: '10px 20px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}
              >
                {deleting ? 'Processing...' : isSuperAdmin ? 'Confirm Delete' : 'Submit for Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 460, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f2342', marginBottom: 20 }}>Create User</h2>
            <form onSubmit={submitCreateUser}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>First Name *</label>
                  <input
                    required value={createForm.firstName}
                    onChange={e => setCreateForm(f => ({ ...f, firstName: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Last Name *</label>
                  <input
                    required value={createForm.lastName}
                    onChange={e => setCreateForm(f => ({ ...f, lastName: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Email *</label>
                <input
                  required type="email" value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Password *</label>
                <input
                  required type="password" value={createForm.password}
                  onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              {createMsg && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{createMsg}</p>}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)} disabled={creating}>Cancel</button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{ padding: '10px 20px', background: '#0e3416', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}
                >
                  {creating ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
