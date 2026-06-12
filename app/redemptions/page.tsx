'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { adminApi, type RedemptionListItem, type PagedResult } from '@/lib/api';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

const STATUSES = ['', 'UnderReview', 'Active', 'Rejected', 'Redeemed'];
const PAGE_SIZE = 20;

export default function RedemptionsPage() {
  const { user: authUser } = useAdminAuth();
  const isSuperAdmin = (authUser?.adminRole ?? 'SuperAdmin') === 'SuperAdmin';
  const [result, setResult] = useState<PagedResult<RedemptionListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectAllRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
    if (status) params.status = status;
    if (search) params.search = search;
    if (from) params.from = from;
    if (to) params.to = to;
    adminApi.redemptions(params)
      .then(r => { if (r.success) setResult(r.data); })
      .finally(() => setLoading(false));
  }, [page, status, search, from, to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectAllRef.current || !result) return;
    const pageIds = result.items.map(r => r.id);
    const selectedOnPage = pageIds.filter(id => selected.has(id)).length;
    selectAllRef.current.indeterminate = selectedOnPage > 0 && selectedOnPage < pageIds.length;
  }, [selected, result]);

  const toggleSelectAll = () => {
    if (!result) return;
    const pageIds = result.items.map(r => r.id);
    const allSelected = pageIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
  };

  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    const r = await adminApi.bulkDeleteRedemptions(Array.from(selected));
    if (r.success) {
      setSelected(new Set());
      setShowDeleteConfirm(false);
      if (isSuperAdmin) load();
      else alert(`Change submitted for approval — ${r.message}`);
    } else {
      alert(r.message || 'Delete failed.');
    }
    setDeleting(false);
  };

  const pageIds = result?.items.map(r => r.id) ?? [];
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));

  return (
    <AdminLayout>
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416' }}>Redemption Requests</h1>
          {selected.size > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{ padding: '9px 18px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Delete Selected ({selected.size})
            </button>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ flex: '1 1 220px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
          />
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
            style={{ flex: '1 1 130px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
            {STATUSES.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
          </select>
          <input
            type="date"
            value={from}
            onChange={e => { setFrom(e.target.value); setPage(1); }}
            style={{ flex: '1 1 140px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
            title="From date"
          />
          <input
            type="date"
            value={to}
            onChange={e => { setTo(e.target.value); setPage(1); }}
            style={{ flex: '1 1 140px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
            title="To date"
          />
          {(search || from || to) && (
            <button
              onClick={() => { setSearch(''); setFrom(''); setTo(''); setPage(1); }}
              style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white', cursor: 'pointer', color: '#64748b' }}
            >Clear</button>
          )}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 32, color: '#64748b' }}>Loading...</div>
          ) : result ? (
            <>
              <div className="table-scroll">
              <table style={{ minWidth: 1070 }}>
                <thead>
                  <tr>
                    <th style={{ width: 40, padding: '12px 8px 12px 16px' }}>
                      <input
                        type="checkbox"
                        ref={selectAllRef}
                        checked={allPageSelected}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th>ID</th>
                    <th>Partner Name</th>
                    <th>Type</th>
                    <th>Units to Redeem</th>
                    <th>Total Units Owned</th>
                    <th>Purchase Price</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.length === 0 ? (
                    <tr><td colSpan={11} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>No redemption requests found</td></tr>
                  ) : result.items.map(r => (
                    <tr key={r.id} style={{ background: selected.has(r.id) ? '#fff7ed' : undefined }}>
                      <td style={{ padding: '12px 8px 12px 16px' }}>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#b8923a' }}>#{r.id}</td>
                      <td style={{ fontWeight: 600 }}>{r.sellingPartnerName ?? '—'}</td>
                      <td>{r.investorType}</td>
                      <td style={{ fontWeight: 700, color: '#0e3416' }}>{r.unitsToRedeem ?? '—'}</td>
                      <td style={{ color: '#64748b' }}>{r.totalUnitsOwned ?? '—'}</td>
                      <td>{r.aggregatePurchasePrice ?? '—'}</td>
                      <td style={{ fontSize: 13, color: '#64748b' }}>{r.email ?? '—'}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td style={{ fontSize: 13, color: '#64748b' }}>{new Date(r.createdOn).toLocaleDateString()}</td>
                      <td>
                        <Link href={`/redemptions/${r.id}`}
                          style={{ padding: '5px 12px', background: '#0f2342', color: 'white', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  {result.totalCount} requests · Page {result.page} of {result.totalPages}
                  {selected.size > 0 && <span style={{ marginLeft: 12, color: '#b8923a', fontWeight: 600 }}>{selected.size} selected</span>}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '8px 16px', fontSize: 13 }}>← Prev</button>
                  <button className="btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page >= result.totalPages} style={{ padding: '8px 16px', fontSize: 13 }}>Next →</button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 32, color: '#ef4444' }}>Failed to load redemptions.</div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f2342', marginBottom: 10 }}>Delete {selected.size} Redemption{selected.size !== 1 ? 's' : ''}?</h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 6 }}>
              This will permanently delete the selected redemption records.
            </p>
            <p style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600, marginBottom: 20 }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: '10px 20px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
