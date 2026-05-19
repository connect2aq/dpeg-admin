'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { adminApi, type RedemptionListItem, type PagedResult } from '@/lib/api';

const STATUSES = ['', 'UnderReview', 'Active', 'Rejected', 'Redeemed'];
const PAGE_SIZE = 20;

export default function RedemptionsPage() {
  const [result, setResult] = useState<PagedResult<RedemptionListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

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

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: 24 }}>Redemption Requests</h1>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, minWidth: 240 }}
          />
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
            {STATUSES.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
          </select>
          <input
            type="date"
            value={from}
            onChange={e => { setFrom(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
            title="From date"
          />
          <input
            type="date"
            value={to}
            onChange={e => { setTo(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
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
              <table>
                <thead>
                  <tr>
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
                    <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>No redemption requests found</td></tr>
                  ) : result.items.map(r => (
                    <tr key={r.id}>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  {result.totalCount} requests · Page {result.page} of {result.totalPages}
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
    </AdminLayout>
  );
}
