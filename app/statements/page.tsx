'use client';
import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { SortableTh } from '@/components/SortableTh';
import { adminApi, type StatementListItem, type PagedResult } from '@/lib/api';

const TYPES = ['', 'Monthly', 'InvestmentConfirmation', 'RedemptionConfirmation'];
const TYPE_LABELS: Record<string, string> = {
  Monthly: 'Monthly',
  InvestmentConfirmation: 'Investment Confirmation',
  RedemptionConfirmation: 'Redemption Confirmation',
};
const PAGE_SIZE = 20;

export default function StatementsPage() {
  const [result, setResult] = useState<PagedResult<StatementListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortOn, setSortOn] = useState('generated');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (key: string) => {
    if (sortOn === key) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortOn(key); setSortDirection('asc'); }
    setPage(1);
  };
  const [downloading, setDownloading] = useState<number | null>(null);

  const downloadPdf = async (id: number, investorName: string) => {
    setDownloading(id);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
      const res = await fetch(adminApi.statementPdfUrl(id), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to download');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement_${investorName.replace(/\s+/g, '_')}_${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('PDF download failed. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE, sortOn, sortDirection };
    if (type) params.type = type;
    if (search) params.search = search;
    adminApi.statements(params)
      .then(r => { if (r.success) setResult(r.data); })
      .finally(() => setLoading(false));
  }, [page, type, search, sortOn, sortDirection]);

  useEffect(() => { load(); }, [load]);

  const totalPages = result ? Math.ceil(result.totalCount / PAGE_SIZE) : 1;

  const colStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 13, color: '#374151',
    borderBottom: '1px solid #f1f5f9',
  };
  const thStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: '2px solid #e2e8f0', background: '#f8fafc', textAlign: 'left',
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: 24 }}>Investor Statements</h1>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search by investor name or email…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, minWidth: 240 }}
          />
          <select value={type} onChange={e => { setType(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
            {TYPES.map(t => <option key={t} value={t}>{t ? (TYPE_LABELS[t] ?? t) : 'All Types'}</option>)}
          </select>
        </div>

        {loading ? (
          <p style={{ color: '#64748b', fontSize: 14 }}>Loading…</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <SortableTh label="Investor" sortKey="investorname" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={thStyle} />
                    <SortableTh label="Type" sortKey="type" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={thStyle} />
                    <SortableTh label="Period" sortKey="period" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={thStyle} />
                    <SortableTh label="Generated" sortKey="generated" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={thStyle} />
                    <th style={thStyle}>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.items.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ ...colStyle, textAlign: 'center', color: '#9ca3af', padding: 32 }}>
                        No statements found
                      </td>
                    </tr>
                  )}
                  {result?.items.map(s => {
                    const period = s.periodStart && s.periodEnd
                      ? `${new Date(s.periodStart).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – ${new Date(s.periodEnd).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                      : '—';
                    return (
                      <tr key={s.id}>
                        <td style={colStyle}>
                          <div style={{ fontWeight: 500 }}>{s.investorName}</div>
                          {s.investorEmail && <div style={{ fontSize: 12, color: '#9ca3af' }}>{s.investorEmail}</div>}
                        </td>
                        <td style={colStyle}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                            background: s.statementType === 'Monthly' ? '#eff6ff' : s.statementType === 'InvestmentConfirmation' ? '#f0fdf4' : '#fef3c7',
                            color: s.statementType === 'Monthly' ? '#1d4ed8' : s.statementType === 'InvestmentConfirmation' ? '#15803d' : '#b45309',
                            fontSize: 12, fontWeight: 600,
                          }}>
                            {TYPE_LABELS[s.statementType] ?? s.statementType}
                          </span>
                        </td>
                        <td style={colStyle}>{period}</td>
                        <td style={colStyle}>{new Date(s.generatedOn).toLocaleDateString()}</td>
                        <td style={colStyle}>
                          {s.hasPdf ? (
                            <button
                              onClick={() => downloadPdf(s.id, s.investorName)}
                              disabled={downloading === s.id}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: downloading === s.id ? 'not-allowed' : 'pointer', color: '#0f2342', fontWeight: 600, fontSize: 12, textDecoration: 'underline', opacity: downloading === s.id ? 0.5 : 1 }}>
                              {downloading === s.id ? 'Downloading…' : 'Download'}
                            </button>
                          ) : (
                            <span style={{ fontSize: 12, color: '#9ca3af' }}>Not available</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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
              {result?.totalCount ?? 0} total statement{result?.totalCount !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
