'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { adminApi, type CapitalLedger, type CapitalLedgerEntry } from '@/lib/api';
import { downloadCsv } from '@/lib/exportCsv';
import Link from 'next/link';

const TYPE_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  Contribution: { bg: '#f0fdf4', text: '#15803d', badge: '#dcfce7' },
  Redemption:   { bg: '#fff1f2', text: '#be123c', badge: '#ffe4e6' },
  Dividend:     { bg: '#fffbeb', text: '#b45309', badge: '#fef3c7' },
};

const entryHref = (e: CapitalLedgerEntry): string => {
  if (e.entryType === 'Contribution') return `/applications/${e.entryId}`;
  if (e.entryType === 'Redemption')   return `/redemptions/${e.entryId}`;
  // Dividend — no own detail page; go to the parent application
  return `/applications/${e.applicationId}`;
};

const entryLabel = (e: CapitalLedgerEntry): string => {
  if (e.entryType === 'Contribution') return `App #${e.entryId}`;
  if (e.entryType === 'Redemption')   return `Rdm #${e.entryId}`;
  return `Div #${e.entryId}`;
};

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `$${(n / 1_000).toFixed(1)}K`
  : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtFull = (n: number) =>
  `${n < 0 ? '−$' : '$'}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAGE_SIZE = 50;

const TYPE_LABELS: Record<string, string> = {
  'Contribution':        'Contributions',
  'Redemption':          'Redemptions',
  'Dividend':            'Dividends',
  'Redemption,Dividend': 'Redemptions + Dividends',
};

function CapitalLedgerContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<CapitalLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => searchParams.get('from') ?? '');
  const [to, setTo] = useState(() => searchParams.get('to') ?? '');
  const [typeFilter, setTypeFilter] = useState(() => searchParams.get('type') ?? '');
  const [search, setSearch] = useState('');
  const [appIdFilter, setAppIdFilter] = useState('');
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.capitalLedger({ from: from || undefined, to: to || undefined })
      .then(r => { if (r.success && r.data) setData(r.data); })
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const activeTypes = typeFilter ? typeFilter.split(',') : [];
  const visibleEntries = (data?.entries ?? []).filter(e => {
    if (activeTypes.length > 0 && !activeTypes.includes(e.entryType)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.investorName.toLowerCase().includes(q)
        && !e.accountUserName.toLowerCase().includes(q)
        && !e.accountUserEmail.toLowerCase().includes(q)) return false;
    }
    if (appIdFilter) {
      const id = appIdFilter.replace('#', '').trim();
      if (String(e.applicationId ?? '') !== id) return false;
    }
    return true;
  });

  useEffect(() => { setPage(1); }, [data, typeFilter, search, appIdFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleEntries.length / PAGE_SIZE));
  const pageEntries = visibleEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportToExcel = async () => {
    setExporting(true);
    const r = await adminApi.capitalLedger({ from: from || undefined, to: to || undefined });
    if (r.success && r.data) {
      const rows = r.data.entries
        .filter(e => activeTypes.length === 0 || activeTypes.includes(e.entryType))
        .map(e => [
          entryLabel(e),
          e.applicationId ? `#${e.applicationId}` : '',
          new Date(e.date).toLocaleDateString(),
          e.entryType,
          e.investmentType === 'ShortTerm' ? 'Short Term' : e.investmentType === 'LongTerm' ? 'Long Term' : '',
          e.investorName,
          e.accountUserName,
          e.accountUserEmail,
          e.ppmRefNo ?? '',
          e.units ?? '',
          e.entryType !== 'Dividend' && e.amount !== 0 ? e.amount : '',
          e.dividendPaid != null ? e.dividendPaid : '',
          e.runningBalance,
        ]);
      downloadCsv(
        [['ID', 'App ID', 'Date', 'Type', 'Inv. Type', 'Investor', 'Account User', 'Account User Email', 'PPM Ref', 'Units', 'Amount', 'Dividend Paid', 'Running Balance'], ...rows],
        'capital-ledger.csv',
      );
    }
    setExporting(false);
  };

  const statCard = (label: string, value: string, color: string, sub?: string) => (
    <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '14px 20px', minWidth: 170 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
    </div>
  );

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: 4 }}>Fund Capital Ledger</h1>
            <p style={{ color: '#64748b', fontSize: 13 }}>
              Chronological record of all fund capital movements — contributions, redemptions, and dividends — with running balance.
            </p>
          </div>
        </div>

        {/* Active filter banner — shown when arriving from dashboard deep-link */}
        {typeFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 18px', background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 10 }}>
            <span style={{ fontSize: 13, color: '#92400e' }}>Filtered by:</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#92400e', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              {TYPE_LABELS[typeFilter] ?? typeFilter}
            </span>
            <button onClick={() => setTypeFilter('')}
              style={{ marginLeft: 'auto', padding: '4px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              × Clear Filter
            </button>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} title="From date" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} title="To date" />
          <button onClick={load} style={{ padding: '9px 18px', background: '#0e3416', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Apply
          </button>
          <button onClick={() => { setFrom(''); setTo(''); }} style={{ padding: '9px 14px', background: '#f1f5f9', color: '#475569', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            Clear
          </button>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ padding: '9px 12px', border: typeFilter ? '2px solid #f59e0b' : '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: typeFilter ? 700 : 400, background: typeFilter ? '#fffbeb' : 'white', color: typeFilter ? '#92400e' : '#374151' }}>
            <option value="">All Types</option>
            <option value="Contribution">Contributions</option>
            <option value="Redemption">Redemptions</option>
            <option value="Dividend">Dividends</option>
            <option value="Redemption,Dividend">Redemptions + Dividends</option>
          </select>
          <input type="text" placeholder="Search Account User or Investor…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, flex: '1 1 180px' }} />
          <input type="text" placeholder="App ID e.g. 29" value={appIdFilter} onChange={e => setAppIdFilter(e.target.value)}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 140 }} />
          <button onClick={exportToExcel} disabled={exporting}
            style={{ padding: '9px 18px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.7 : 1 }}>
            {exporting ? 'Exporting…' : '↓ Export'}
          </button>
        </div>

        {/* Summary */}
        {data && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            {data.openingBalance !== 0 && statCard('Opening Balance', fmtFull(data.openingBalance), '#0f2342', from ? `as at ${from}` : undefined)}
            {statCard('Total Contributions', fmtFull(data.totalContributions), '#15803d', `${data.entries.filter(e => e.amount > 0).length} entries`)}
            {statCard('Total Redemptions', `−${fmtFull(data.totalRedemptions)}`, '#be123c', `${data.entries.filter(e => e.entryType === 'Redemption').length} entries`)}
            {statCard('Dividends Paid', `−${fmtFull(data.totalDistributions + data.totalRedemptionDistributions)}`, '#b45309',
              data.totalRedemptionDistributions > 0
                ? `${fmtFull(data.totalDistributions)} monthly + ${fmtFull(data.totalRedemptionDistributions)} on exit`
                : `${data.entries.filter(e => e.entryType === 'Dividend').length} entries`
            )}
            {statCard('Net Balance', fmtFull(data.closingBalance), '#0f2342', 'closing balance')}
            {data.totalPendingAccruals > 0 && statCard('Accrued & Unpaid', `~${fmtFull(data.totalPendingAccruals)}`, '#7c3aed', 'pending daily accruals')}
          </div>
        )}

        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>ID</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>App ID</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Date</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Type</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Inv. Type</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Investor</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Account User</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Units</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Amount</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#b45309' }}>Dividend Paid</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.length === 0 && (
                  <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No entries found.</td></tr>
                )}
                {pageEntries.map((e, i) => {
                  const colors = TYPE_COLORS[e.entryType] ?? TYPE_COLORS.Contribution;
                  const showAmount = e.entryType !== 'Dividend';
                  const isCredit = e.amount > 0;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                        {e.entryId
                          ? <Link href={entryHref(e)} style={{ color: '#0f2342', textDecoration: 'none', fontWeight: 700, fontSize: 12 }}>{entryLabel(e)}</Link>
                          : '—'}
                      </td>
                      <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                        {e.applicationId
                          ? <Link href={`/applications/${e.applicationId}`} style={{ color: '#b8923a', textDecoration: 'underline', fontWeight: 600, fontSize: 12 }}>#{e.applicationId}</Link>
                          : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 16px', color: '#374151', whiteSpace: 'nowrap' }}>
                        {new Date(e.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{ background: colors.badge, color: colors.text, fontWeight: 600, fontSize: 11, borderRadius: 5, padding: '3px 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {e.entryType}
                        </span>
                      </td>
                      <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                        {e.investmentType ? (
                          <span style={{ background: e.investmentType === 'ShortTerm' ? '#eff6ff' : '#f5f3ff', color: e.investmentType === 'ShortTerm' ? '#1d4ed8' : '#6d28d9', fontWeight: 600, fontSize: 11, borderRadius: 5, padding: '3px 8px' }}>
                            {e.investmentType === 'ShortTerm' ? 'Short Term' : 'Long Term'}
                          </span>
                        ) : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{e.investorName || '—'}</div>
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        {e.accountUserId ? (
                          <Link href={`/investor-statements?userId=${e.accountUserId}`} style={{ display: 'inline-block', fontWeight: 600, color: '#1e293b', textDecoration: 'underline' }}>
                            {e.accountUserName || '—'}
                          </Link>
                        ) : (
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{e.accountUserName || '—'}</div>
                        )}
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{e.accountUserEmail}</div>
                      </td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', color: '#374151' }}>
                        {e.units != null ? e.units : '—'}
                      </td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap',
                        color: showAmount ? (isCredit ? '#15803d' : '#be123c') : '#cbd5e1' }}>
                        {showAmount
                          ? <>{isCredit ? '+' : '−'}{fmtFull(Math.abs(e.amount))}</>
                          : '—'}
                      </td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>
                        {e.dividendPaid != null && e.dividendPaid !== 0
                          ? <>−{fmtFull(Math.abs(e.dividendPaid))}</>
                          : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 600, color: '#0f2342', whiteSpace: 'nowrap' }}>
                        {fmtFull(e.runningBalance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {visibleEntries.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                    <td colSpan={8} style={{ padding: '12px 16px', fontWeight: 700, color: '#374151', fontSize: 13 }}>
                      Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visibleEntries.length)} of {visibleEntries.length} entries
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#0f2342', fontSize: 13 }}>
                      Net: {fmtFull(visibleEntries.reduce((s, e) => s + e.amount, 0))}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#b45309', fontSize: 13 }}>
                      −{fmtFull(Math.abs(visibleEntries.reduce((s, e) => s + (e.dividendPaid ?? 0), 0)))}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#0f2342', fontSize: 13 }}>
                      {data && fmtFull(data.closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        {!loading && visibleEntries.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 4px', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              Page {page} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '8px 16px', fontSize: 13 }}>← Prev</button>
              <button className="btn-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '8px 16px', fontSize: 13 }}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default function CapitalLedgerPage() {
  return (
    <Suspense>
      <CapitalLedgerContent />
    </Suspense>
  );
}
