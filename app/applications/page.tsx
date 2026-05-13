'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { adminApi, type ApplicationListItem, type PagedResult } from '@/lib/api';

const STATUSES = ['', 'UnderReview', 'Active', 'Rejected'];
const TYPES = ['', 'Individual', 'Entity', 'IRA', 'Trust'];
const PAGE_SIZE = 20;

export default function ApplicationsPage() {
  const [result, setResult] = useState<PagedResult<ApplicationListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [investorType, setInvestorType] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
    if (search) params.search = search;
    if (status) params.status = status;
    if (investorType) params.investorType = investorType;
    adminApi.applications(params)
      .then(r => { if (r.success) setResult(r.data); })
      .finally(() => setLoading(false));
  }, [page, search, status, investorType]);

  useEffect(() => { load(); }, [load]);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: 24 }}>Applications</h1>

        {/* Filters */}
        <form onSubmit={e => { e.preventDefault(); setPage(1); load(); }} style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by investor name or email..."
            style={{ flex: '1 1 250px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
          />
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
            {STATUSES.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
          </select>
          <select value={investorType} onChange={e => { setInvestorType(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
            {TYPES.map(t => <option key={t} value={t}>{t || 'All Types'}</option>)}
          </select>
          <button type="submit" className="btn-primary">Search</button>
        </form>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 32, color: '#64748b' }}>Loading...</div>
          ) : result ? (
            <>
              <table>
                <thead>
                  <tr>
                    <th>ID / Ref</th>
                    <th>Investor</th>
                    <th>Type</th>
                    <th>Units</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>No applications found</td></tr>
                  ) : result.items.map(a => (
                    <tr key={a.id}>
                      <td>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{a.id}</div>
                        {a.ppmRefNO && <div style={{ fontSize: 11, color: '#94a3b8' }}>PPM {a.ppmRefNO}</div>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{a.userFirstName} {a.userLastName}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{a.userEmail}</div>
                      </td>
                      <td>{a.investorType}</td>
                      <td>{a.numUnits ?? '—'}</td>
                      <td style={{ fontWeight: 600 }}>{a.totalAmount ? `$${a.totalAmount.toLocaleString()}` : '—'}</td>
                      <td><StatusBadge status={a.status} /></td>
                      <td style={{ color: '#64748b', fontSize: 13 }}>{a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '—'}</td>
                      <td>
                        <Link href={`/applications/${a.id}`} style={{ color: '#699172', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>View →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  {result.totalCount} applications · Page {result.page} of {result.totalPages}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '8px 16px', fontSize: 13 }}>← Prev</button>
                  <button className="btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page >= result.totalPages} style={{ padding: '8px 16px', fontSize: 13 }}>Next →</button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 32, color: '#ef4444' }}>Failed to load applications.</div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
