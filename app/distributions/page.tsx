'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { adminApi, type DistributionListItem, type DistributionRunResult, type PagedResult } from '@/lib/api';

const STATUSES = ['', 'Pending', 'Sent', 'Failed', 'Paid'];
const MONTHS = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAGE_SIZE = 20;

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

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

  // Catch-up state
  const [catchUpFrom, setCatchUpFrom] = useState(firstOfMonthStr());
  const [catchUpTo, setCatchUpTo] = useState(yesterdayStr());
  const [catchUpLoading, setCatchUpLoading] = useState(false);
  const [catchUpResult, setCatchUpResult] = useState<{ appsProcessed: number; logsCreated: number; errors: string[] } | null>(null);
  const [catchUpError, setCatchUpError] = useState<string | null>(null);

  // Run distribution state
  const [runDate, setRunDate] = useState(todayStr());
  const [runMode, setRunMode] = useState<'preview' | 'execute' | null>(null);
  const [runResults, setRunResults] = useState<DistributionRunResult[] | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [pushedIds, setPushedIds] = useState<Set<number>>(new Set());
  const [batchPushing, setBatchPushing] = useState(false);
  const [batchResult, setBatchResult] = useState<{ pushed: number; failed: number } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

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
    const paidDate = paidDateInput[id] || todayStr();
    setMarkingId(id);
    const r = await adminApi.markDistributionPaid(id, paidDate);
    setMarkingId(null);
    if (r.success) load();
  };

  const handleCatchUp = async () => {
    setCatchUpLoading(true);
    setCatchUpResult(null);
    setCatchUpError(null);
    const r = await adminApi.runBulkCatchUp(catchUpFrom, catchUpTo);
    setCatchUpLoading(false);
    if (r.success) setCatchUpResult(r.data);
    else setCatchUpError('Catch-up failed. Check the date range and try again.');
  };

  const handlePreview = async () => {
    setRunLoading(true);
    setRunMode('preview');
    setRunResults(null);
    setBatchResult(null);
    setPushedIds(new Set());
    setRunError(null);
    const r = await adminApi.simulateDistribution(runDate);
    setRunLoading(false);
    if (r.success) setRunResults(r.data);
    else setRunError('Preview failed. Check the date and try again.');
  };

  const handleExecute = async () => {
    setRunLoading(true);
    setRunMode('execute');
    setRunResults(null);
    setBatchResult(null);
    setPushedIds(new Set());
    setRunError(null);
    const r = await adminApi.executeDistribution(runDate);
    setRunLoading(false);
    if (r.success) { setRunResults(r.data); load(); }
    else setRunError('Execute failed. Check the date and try again.');
  };

  const handlePushOne = async (id: number) => {
    setPushingId(id);
    const r = await adminApi.pushDistributionToOdoo(id);
    setPushingId(null);
    if (r.success) {
      setPushedIds(prev => new Set([...prev, id]));
      load();
    }
  };

  const handleBatchPush = async () => {
    const ids = (runResults ?? [])
      .filter(r => !r.alreadyRan && r.distributionLogId !== null && !pushedIds.has(r.distributionLogId!))
      .map(r => r.distributionLogId!);
    if (!ids.length) return;
    setBatchPushing(true);
    setBatchResult(null);
    const r = await adminApi.batchPushToOdoo(ids);
    setBatchPushing(false);
    if (r.success) {
      setBatchResult(r.data);
      setPushedIds(prev => new Set([...prev, ...ids]));
      load();
    }
  };

  const totalPages = result ? Math.ceil(result.totalCount / PAGE_SIZE) : 1;
  const pendingPushCount = (runResults ?? []).filter(
    r => !r.alreadyRan && r.distributionLogId !== null && !pushedIds.has(r.distributionLogId!)
  ).length;

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

        {/* Catch-Up Panel */}
        <div style={{ background: '#fefce8', border: '1.5px solid #fde68a', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#92400e', marginBottom: 10 }}>Step 1 — Backfill Missing Daily Interest</div>
          <div style={{ fontSize: 13, color: '#78350f', marginBottom: 14 }}>
            Run this first if daily interest logs are missing for a date range (e.g. newly activated investors).
            Creates logs for all active investors where no log exists yet, and sends each one to Odoo.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: '#78350f', fontWeight: 500 }}>From</label>
            <input
              type="date"
              value={catchUpFrom}
              onChange={e => { setCatchUpFrom(e.target.value); setCatchUpResult(null); }}
              style={{ padding: '9px 12px', border: '1.5px solid #fde68a', borderRadius: 8, fontSize: 14, background: '#fffbeb' }}
            />
            <label style={{ fontSize: 13, color: '#78350f', fontWeight: 500 }}>To</label>
            <input
              type="date"
              value={catchUpTo}
              onChange={e => { setCatchUpTo(e.target.value); setCatchUpResult(null); }}
              style={{ padding: '9px 12px', border: '1.5px solid #fde68a', borderRadius: 8, fontSize: 14, background: '#fffbeb' }}
            />
            <button
              onClick={handleCatchUp}
              disabled={catchUpLoading}
              style={{ padding: '9px 20px', background: '#b45309', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: catchUpLoading ? 'not-allowed' : 'pointer', opacity: catchUpLoading ? 0.6 : 1 }}>
              {catchUpLoading ? 'Running…' : 'Run Catch-Up'}
            </button>
          </div>
          {catchUpError && <div style={{ marginTop: 10, fontSize: 13, color: '#dc2626' }}>{catchUpError}</div>}
          {catchUpResult && (
            <div style={{ marginTop: 10 }}>
              <div style={{ padding: '8px 14px', background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#15803d', fontWeight: 500, display: 'inline-block' }}>
                ✓ Catch-up complete — {catchUpResult.appsProcessed} investor{catchUpResult.appsProcessed !== 1 ? 's' : ''} updated, {catchUpResult.logsCreated} new log{catchUpResult.logsCreated !== 1 ? 's' : ''} created.
                {catchUpResult.logsCreated > 0 && ' Now run Preview below to see updated amounts.'}
              </div>
              {catchUpResult.errors?.length > 0 && (
                <div style={{ marginTop: 10, padding: '12px 16px', background: '#fef9c3', border: '1.5px solid #fbbf24', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                    ⚠ {catchUpResult.errors.length} redemption{catchUpResult.errors.length !== 1 ? 's' : ''} skipped — EffectiveDate missing or invalid. Fix these records manually:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {catchUpResult.errors.map((e, i) => (
                      <li key={i} style={{ fontSize: 12, color: '#78350f', marginBottom: 2, fontFamily: 'monospace' }}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Run Distribution Panel */}
        <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 14 }}>Step 2 — Run Distribution</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
            Pick a date to calculate distributions for all active investors from the 1st of that month up to the chosen date.
            <br />Preview shows projected amounts without saving. Execute saves records and lets you push to Odoo.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="date"
              value={runDate}
              onChange={e => { setRunDate(e.target.value); setRunResults(null); setBatchResult(null); }}
              style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
            />
            <button
              onClick={handlePreview}
              disabled={runLoading}
              style={{ padding: '9px 20px', background: '#fff', color: '#0f2342', border: '1.5px solid #0f2342', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: runLoading ? 'not-allowed' : 'pointer', opacity: runLoading ? 0.6 : 1 }}>
              {runLoading && runMode === 'preview' ? 'Previewing…' : 'Preview'}
            </button>
            <button
              onClick={handleExecute}
              disabled={runLoading}
              style={{ padding: '9px 20px', background: '#0f2342', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: runLoading ? 'not-allowed' : 'pointer', opacity: runLoading ? 0.6 : 1 }}>
              {runLoading && runMode === 'execute' ? 'Executing…' : 'Execute'}
            </button>
          </div>
          {runError && <div style={{ marginTop: 10, fontSize: 13, color: '#dc2626' }}>{runError}</div>}
        </div>

        {/* Run Results */}
        {runResults !== null && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2342' }}>
                {runMode === 'preview' ? 'Preview' : 'Execution'} Results — {runDate}
                <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 400, color: '#64748b' }}>
                  {runResults.filter(r => !r.alreadyRan).length} record{runResults.filter(r => !r.alreadyRan).length !== 1 ? 's' : ''} across{' '}
                  {new Set(runResults.filter(r => !r.alreadyRan).map(r => r.applicationId)).size} investor{new Set(runResults.filter(r => !r.alreadyRan).map(r => r.applicationId)).size !== 1 ? 's' : ''} •{' '}
                  ${runResults.filter(r => !r.alreadyRan).reduce((s, r) => s + r.totalNetAmount, 0).toFixed(2)} total
                </span>
              </div>
              {runMode === 'execute' && pendingPushCount > 0 && (
                <button
                  onClick={handleBatchPush}
                  disabled={batchPushing}
                  style={{ padding: '8px 18px', background: '#b8923a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: batchPushing ? 'not-allowed' : 'pointer', opacity: batchPushing ? 0.6 : 1 }}>
                  {batchPushing ? 'Pushing…' : `Push All to Odoo (${pendingPushCount})`}
                </button>
              )}
            </div>
            {batchResult && (
              <div style={{ marginBottom: 10, padding: '8px 14px', background: batchResult.failed > 0 ? '#fff7ed' : '#f0fdf4', borderRadius: 8, fontSize: 13, color: batchResult.failed > 0 ? '#92400e' : '#15803d', fontWeight: 500 }}>
                Batch push: {batchResult.pushed} sent{batchResult.failed > 0 ? `, ${batchResult.failed} failed` : ''}
              </div>
            )}
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Investor', 'Month', 'PPM', 'Days', 'Amount', 'Recalculated', 'Bank', 'Status', ...(runMode === 'execute' ? ['Odoo'] : [])].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runResults.length === 0 && (
                    <tr><td colSpan={10} style={{ ...colStyle, textAlign: 'center', color: '#9ca3af', padding: 32 }}>No investors to distribute for this date</td></tr>
                  )}
                  {runResults.map((r, i) => {
                    const isPushed = r.distributionLogId !== null && pushedIds.has(r.distributionLogId);
                    return (
                      <tr key={i} style={{ background: r.alreadyRan ? '#f8fafc' : r.hasMismatch ? '#fff7ed' : undefined }}>
                        <td style={colStyle}>
                          <div style={{ fontWeight: 500, color: r.alreadyRan ? '#9ca3af' : undefined }}>{r.investorName}</div>
                          {r.investorEmail && <div style={{ fontSize: 12, color: '#9ca3af' }}>{r.investorEmail}</div>}
                          {r.hasMismatch && <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>⚠ Mismatch</span>}
                          {r.alreadyRan && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Already ran</span>}
                        </td>
                        <td style={{ ...colStyle, fontWeight: 500 }}>
                          {new Date(r.distributionMonth).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ ...colStyle, color: '#9ca3af' }}>{r.ppmRefNo || '—'}</td>
                        <td style={colStyle}>{r.alreadyRan ? '—' : r.totalDays}</td>
                        <td style={{ ...colStyle, fontWeight: 600 }}>{r.alreadyRan ? '—' : `$${r.totalNetAmount.toFixed(2)}`}</td>
                        <td style={colStyle}>{r.alreadyRan ? '—' : `$${r.recalculatedAmount.toFixed(2)}`}</td>
                        <td style={colStyle}>
                          {r.bankName && <div>{r.bankName}</div>}
                          {r.bankAccountNumber && <div style={{ fontSize: 12, color: '#6b7280' }}>{r.bankAccountNumber}</div>}
                        </td>
                        <td style={colStyle}>
                          {r.alreadyRan
                            ? <span style={{ fontSize: 12, color: '#94a3b8' }}>Skipped</span>
                            : runMode === 'preview'
                              ? <span style={{ fontSize: 12, color: '#64748b' }}>Preview only</span>
                              : isPushed
                                ? <StatusBadge status="Sent" />
                                : <StatusBadge status="Pending" />}
                        </td>
                        {runMode === 'execute' && (
                          <td style={{ ...colStyle, minWidth: 130 }}>
                            {!r.alreadyRan && r.distributionLogId !== null && !isPushed && (
                              <button
                                onClick={() => handlePushOne(r.distributionLogId!)}
                                disabled={pushingId === r.distributionLogId}
                                style={{ padding: '5px 12px', background: '#b8923a', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: pushingId === r.distributionLogId ? 0.6 : 1 }}>
                                {pushingId === r.distributionLogId ? '…' : 'Push to Odoo'}
                              </button>
                            )}
                            {isPushed && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Sent</span>}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Distribution History</span>
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
