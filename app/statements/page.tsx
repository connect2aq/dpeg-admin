'use client';
import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { PaginationControls } from '@/components/PaginationControls';
import { SortableTh } from '@/components/SortableTh';
import { adminApi, type StatementListItem, type PagedResult } from '@/lib/api';
import { encodeMultiFilterValue, hasMultiFilterValue } from '@/lib/filterUtils';
import type { QueryParams } from '@/lib/apiContracts';
import { formatShortDate } from '@/lib/dateFormat';
import { PAGE_SIZE_OPTIONS } from '@/lib/pagination';

const TYPES = ['Monthly', 'InvestmentConfirmation', 'RedemptionConfirmation'];
const TYPE_LABELS: Record<string, string> = {
  Monthly: 'Monthly',
  InvestmentConfirmation: 'Investment Confirmation',
  RedemptionConfirmation: 'Redemption Confirmation',
};
const DEFAULT_PAGE_SIZE = 20;

export default function StatementsPage() {
  const [result, setResult] = useState<PagedResult<StatementListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
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
    const params: QueryParams = { page, pageSize, sortOn, sortDirection };
    const encodedType = encodeMultiFilterValue(type);
    if (encodedType) params.type = encodedType;
    if (search) params.search = search;
    adminApi.statements(params)
      .then(r => { if (r.success) setResult(r.data); })
      .finally(() => setLoading(false));
  }, [page, pageSize, type, search, sortOn, sortDirection]);

  useEffect(() => { load(); }, [load]);

  const totalPages = result ? Math.ceil(result.totalCount / pageSize) : 1;

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
          <MultiSelectFilter
            allLabel="All Types"
            buttonLabel="Type"
            options={TYPES.map(t => ({ value: t, label: TYPE_LABELS[t] ?? t }))}
            selectedValues={type}
            onChange={next => { setType(next); setPage(1); }}
            minWidth={220}
          />
          {(search || hasMultiFilterValue(type)) && (
            <button
              onClick={() => {
                setSearch('');
                setType([]);
                setPage(1);
              }}
              style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white', color: '#475569', cursor: 'pointer' }}
            >
              Reset
            </button>
          )}
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
                      ? `${formatShortDate(s.periodStart)} – ${formatShortDate(s.periodEnd)}`
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
                        <td style={colStyle}>{formatShortDate(s.generatedOn)}</td>
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

            <PaginationControls
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={(next) => {
                setPage(1);
                setPageSize(next);
              }}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              containerStyle={{ justifyContent: 'center', marginTop: 20 }}
              buttonStyle={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
              inputStyle={{ width: 64, padding: '6px 8px' }}
            />

            <p style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>
              {result?.totalCount ?? 0} total statement{result?.totalCount !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
