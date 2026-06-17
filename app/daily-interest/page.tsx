'use client';
import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi, type DailyInterestItem, type PagedResult } from '@/lib/api';

const PAGE_SIZE = 25;

function OdooStatus({ status }: { status?: string | null }) {
  if (!status) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;
  const ok = status === 'Success';
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: ok ? '#f0fdf4' : '#fef2f2', color: ok ? '#15803d' : '#dc2626',
    }}>{status}</span>
  );
}

export default function DailyInterestPage() {
  const [result, setResult] = useState<PagedResult<DailyInterestItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [appId, setAppId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [included, setIncluded] = useState('');
  const [page, setPage] = useState(1);
  const [pushingDIId, setPushingDIId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
    if (appId) params.appId = appId;
    if (from) params.from = from;
    if (to) params.to = to;
    if (included !== '') params.included = included;
    adminApi.dailyInterestLogs(params)
      .then(r => { if (r.success) setResult(r.data); })
      .finally(() => setLoading(false));
  }, [page, appId, from, to, included]);

  useEffect(() => { load(); }, [load]);

  const handlePushDailyInterest = async (id: number) => {
    setPushingDIId(id);
    await adminApi.pushDailyInterestToOdoo(id);
    setPushingDIId(null);
    load();
  };

  const totalPages = result ? Math.ceil(result.totalCount / PAGE_SIZE) : 1;

  const totalInterest = result?.items.reduce((s, i) => s + i.netInterest, 0) ?? 0;

  const th: React.CSSProperties = {
    padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.07em',
    borderBottom: '2px solid #e2e8f0', background: '#f8fafc', textAlign: 'left', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '10px 14px', fontSize: 13, color: '#374151',
    borderBottom: '1px solid #f1f5f9',
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: 6 }}>Daily Interest Logs</h1>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>Daily interest accrual records per investor application.</p>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <input type="number" placeholder="Application ID" value={appId}
            onChange={e => { setAppId(e.target.value); setPage(1); }}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 150 }} />
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
          <select value={included} onChange={e => { setIncluded(e.target.value); setPage(1); }}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: 'white' }}>
            <option value="">All Records</option>
            <option value="true">Included in Distribution</option>
            <option value="false">Pending Distribution</option>
          </select>
        </div>

        {/* Summary bar */}
        {result && result.totalCount > 0 && (
          <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
            {[
              { label: 'Records (this page)', value: result.items.length.toString() },
              { label: 'Interest (this page)', value: `$${totalInterest.toFixed(2)}` },
              { label: 'Total Records', value: result.totalCount.toString() },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 18px' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0e3416' }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <p style={{ color: '#64748b', fontSize: 14 }}>Loading…</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Investor', 'App ID', 'Units', 'Capital', 'Rate', 'Net Interest', 'Odoo ID', 'Odoo Status', 'Distributed', 'Action'].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result?.items.length === 0 && (
                    <tr><td colSpan={11} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 32 }}>No records found</td></tr>
                  )}
                  {result?.items.map(row => (
                    <tr key={row.id} style={{ background: row.includedInMonthlyDistribution ? '#f8fafc' : undefined }}>
                      <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{new Date(row.date).toLocaleDateString()}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 500 }}>{row.investorName}</div>
                        {row.investorEmail && <div style={{ fontSize: 11, color: '#9ca3af' }}>{row.investorEmail}</div>}
                      </td>
                      <td style={{ ...td, color: '#6b7280' }}>#{row.applicationId}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{row.units}</td>
                      <td style={td}>${row.capital.toLocaleString()}</td>
                      <td style={{ ...td, color: '#6b7280' }}>{(row.annualRate * 100).toFixed(0)}%</td>
                      <td style={{ ...td, fontWeight: 700, color: '#0e3416' }}>${row.netInterest.toFixed(4)}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{row.odooInterestId ?? '—'}</td>
                      <td style={td}><OdooStatus status={row.odooStatus} /></td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: row.includedInMonthlyDistribution ? '#f0fdf4' : '#fef9c3',
                          color: row.includedInMonthlyDistribution ? '#15803d' : '#854d0e',
                        }}>
                          {row.includedInMonthlyDistribution ? 'Yes' : 'Pending'}
                        </span>
                      </td>
                      <td style={td}>
                        {row.odooStatus !== 'Success' && (
                          <button
                            onClick={() => handlePushDailyInterest(row.id)}
                            disabled={pushingDIId === row.id}
                            style={{ padding: '4px 11px', background: '#b8923a', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: pushingDIId === row.id ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                            {pushingDIId === row.id ? '…' : 'Push to Odoo'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>← Prev</button>
                <span style={{ padding: '6px 12px', fontSize: 13, color: '#64748b' }}>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}>Next →</button>
              </div>
            )}
            <p style={{ marginTop: 10, fontSize: 13, color: '#94a3b8' }}>{result?.totalCount ?? 0} total record{result?.totalCount !== 1 ? 's' : ''}</p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
