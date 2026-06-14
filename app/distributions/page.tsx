'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { adminApi, type DistributionListItem, type PagedResult } from '@/lib/api';

const STATUSES = ['', 'Pending', 'Sent', 'Failed', 'Paid'];
const MONTHS = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAGE_SIZE = 20;

export default function DistributionsPage() {
  const searchParams = useSearchParams();
  const [result, setResult] = useState<PagedResult<DistributionListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [page, setPage] = useState(1);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [paidDateInput, setPaidDateInput] = useState<{ [id: number]: string }>({});

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
    if (status) params.status = status;
    if (month)  params.month = month;
    if (year)   params.year = year;
    adminApi.distributions(params)
      .then(r => { if (r.success) setResult(r.data); })
      .finally(() => setLoading(false));
  }, [page, status, month, year]);

  useEffect(() => { load(); }, [load]);

  const markPaid = async (id: number) => {
    const paidDate = paidDateInput[id] || new Date().toISOString().split('T')[0];
    setMarkingId(id);
    const r = await adminApi.markDistributionPaid(id, paidDate);
    setMarkingId(null);
    if (r.success) load();
  };

  const totalPages = result ? Math.ceil(result.totalCount / PAGE_SIZE) : 1;

  const colStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 13, color: '#374151',
    borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap',
  };
  const thStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: '2px solid #e2e8f0', background: '#f8fafc', textAlign: 'left',
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: 24 }}>Monthly Distributions</h1>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
            {STATUSES.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
          </select>
          <select value={month} onChange={e => { setMonth(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
            {MONTHS.map((m, i) => <option key={m} value={m}>{m ? MONTH_NAMES[i] : 'All Months'}</option>)}
          </select>
          <input type="number" placeholder="Year (e.g. 2026)" value={year}
            onChange={e => { setYear(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, width: 150 }} />
        </div>

        {loading ? (
          <p style={{ color: '#64748b', fontSize: 14 }}>Loading…</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Investor', 'Month', 'Amount', 'Status', 'Paid At', 'Bank', 'Action'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result?.items.length === 0 && (
                    <tr><td colSpan={7} style={{ ...colStyle, textAlign: 'center', color: '#9ca3af', padding: 32 }}>No distributions found</td></tr>
                  )}
                  {result?.items.map(d => {
                    const monthDate = new Date(d.distributionMonth);
                    const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    const maskedAcct = d.bankAccountNumber && d.bankAccountNumber.length >= 4
                      ? '••••' + d.bankAccountNumber.slice(-4) : d.bankAccountNumber;
                    const canMarkPaid = d.paymentStatus !== 'Paid';
                    return (
                      <tr key={d.id} style={{ background: d.hasMismatch ? '#fff7ed' : undefined }}>
                        <td style={colStyle}>
                          <div style={{ fontWeight: 500 }}>{d.investorName}</div>
                          {d.investorEmail && <div style={{ fontSize: 12, color: '#9ca3af' }}>{d.investorEmail}</div>}
                          {d.hasMismatch && <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>⚠ Mismatch</span>}
                        </td>
                        <td style={colStyle}>{monthLabel}</td>
                        <td style={{ ...colStyle, fontWeight: 600 }}>${d.totalNetAmount.toFixed(2)}</td>
                        <td style={colStyle}><StatusBadge status={d.paymentStatus} /></td>
                        <td style={colStyle}>{d.paidAt ? new Date(d.paidAt).toLocaleDateString() : '—'}</td>
                        <td style={colStyle}>
                          {d.bankName && <div>{d.bankName}</div>}
                          {maskedAcct && <div style={{ fontSize: 12, color: '#6b7280' }}>{maskedAcct}</div>}
                        </td>
                        <td style={{ ...colStyle, minWidth: 200 }}>
                          {canMarkPaid && (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <input type="date"
                                value={paidDateInput[d.id] || ''}
                                onChange={e => setPaidDateInput(prev => ({ ...prev, [d.id]: e.target.value }))}
                                style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12 }} />
                              <button
                                onClick={() => markPaid(d.id)}
                                disabled={markingId === d.id}
                                style={{ padding: '5px 12px', background: '#0f2342', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: markingId === d.id ? 0.6 : 1 }}>
                                {markingId === d.id ? '…' : 'Mark Paid'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>
                  ← Prev
                </button>
                <span style={{ padding: '6px 12px', fontSize: 13, color: '#64748b' }}>
                  {page} / {totalPages}
                </span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}>
                  Next →
                </button>
              </div>
            )}

            <p style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>
              {result?.totalCount ?? 0} total distribution{result?.totalCount !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
