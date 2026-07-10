'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { SortableTh } from '@/components/SortableTh';
import {
  historicalImportApi,
  type ImportSessionDetail,
  type ImportSessionRow,
  type WelcomeEmailRowResult,
  type OdooSyncRowResult,
} from '@/lib/api';

type SortField = 'rowNumber' | 'investorName' | 'userEmail' | 'success' | 'ppmRefNo';

const sortValue = (r: ImportSessionRow, field: SortField): string | number => {
  switch (field) {
    case 'rowNumber':    return r.rowNumber;
    case 'investorName': return r.investorName ?? '';
    case 'userEmail':    return r.userEmail ?? '';
    case 'success':      return r.success ? 1 : 0;
    case 'ppmRefNo':     return r.ppmRefNo ?? '';
  }
};

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
      background: ok ? '#dcfce7' : '#fee2e2',
      color: ok ? '#166534' : '#991b1b',
    }}>{label}</span>
  );
}

export default function SessionDetailPage() {
  const params    = useParams();
  const sessionId = Number(params.sessionId);

  const [session, setSession]     = useState<ImportSessionDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [selected, setSelected]   = useState<Set<number>>(new Set()); // row IDs

  const [emailSending, setEmailSending] = useState(false);
  const [emailResults, setEmailResults] = useState<Record<number, WelcomeEmailRowResult>>({});
  const [odooSyncing, setOdooSyncing]   = useState(false);
  const [odooResults, setOdooResults]   = useState<Record<number, OdooSyncRowResult>>({});
  const [sortField, setSortField] = useState<SortField>('rowNumber');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (field: string) => {
    const f = field as SortField;
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  };

  const load = () => {
    setLoading(true);
    historicalImportApi.getSessionDetail(sessionId)
      .then(res => {
        if (res.success) { setSession(res.data); setSelected(new Set()); }
        else setError(res.message || 'Session not found.');
      })
      .catch(() => setError('Network error. Please try again.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [sessionId]);

  const successRows = session?.rows.filter(r => r.success) ?? [];

  // ── Selection helpers ────────────────────────────────────────────────────────

  const selectableIds = successRows.map(r => r.id);
  const allSelected   = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));
  const someSelected  = selectableIds.some(id => selected.has(id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableIds));
  };

  const toggleRow = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  // Rows the user has checked
  const selectedSuccessRows = successRows.filter(r => selected.has(r.id));

  // Email: selected rows that still need an email
  const emailTargets = selectedSuccessRows.filter(r =>
    r.userId && !r.welcomeEmailSentAt && !emailResults[r.userId!]?.sent && !emailResults[r.userId!]?.alreadySent
  );

  // Odoo: selected rows that still need any Odoo sync (investor pending, or investor done but investment pending)
  const odooTargets = selectedSuccessRows.filter(r =>
    r.applicationId &&
    !odooResults[r.applicationId!] &&
    (!r.odooInvestorSyncedAt || !r.odooInvestmentSyncedAt)
  );

  // ── Send emails ──────────────────────────────────────────────────────────────

  const sendEmails = async (userIds: number[]) => {
    setEmailSending(true);
    try {
      const res = await historicalImportApi.sendWelcomeEmails(userIds);
      if (res.success) {
        const map: Record<number, WelcomeEmailRowResult> = { ...emailResults };
        res.data.rows.forEach(r => { map[r.userId] = r; });
        setEmailResults(map);
        load();
      }
    } catch {/* ignore */}
    finally { setEmailSending(false); }
  };

  // ── Odoo sync ────────────────────────────────────────────────────────────────

  const syncOdoo = async (applicationIds: number[]) => {
    setOdooSyncing(true);
    try {
      const res = await historicalImportApi.syncToOdoo(applicationIds);
      if (res.success) {
        const map: Record<number, OdooSyncRowResult> = { ...odooResults };
        res.data.rows.forEach(r => { map[r.applicationId] = r; });
        setOdooResults(map);
        load();
      }
    } catch {/* ignore */}
    finally { setOdooSyncing(false); }
  };

  // ── Styles ───────────────────────────────────────────────────────────────────

  const s = {
    page:  { padding: '32px 0' } as React.CSSProperties,
    h1:    { fontSize: 22, fontWeight: 700, color: '#0f2342', marginBottom: 4 } as React.CSSProperties,
    sub:   { color: '#64748b', fontSize: 14, marginBottom: 28 } as React.CSSProperties,
    card:  { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px' } as React.CSSProperties,
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
    th:    { padding: '8px 12px', textAlign: 'left' as const, background: '#0f2342', color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const },
    td:    { padding: '8px 12px', borderBottom: '1px solid #f1f5f9', color: '#1a1a2e' },
    btn: (color: string, disabled?: boolean): React.CSSProperties => ({
      padding: '7px 16px', borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: 12, fontWeight: 600, background: disabled ? '#d1d5db' : color, color: '#fff', opacity: disabled ? 0.7 : 1,
    }),
  };

  // ── Cell renderers ───────────────────────────────────────────────────────────

  const emailStatusCell = (row: ImportSessionRow) => {
    const transient = row.userId ? emailResults[row.userId] : undefined;
    if (!row.success) return <span style={{ color: '#94a3b8' }}>—</span>;
    if (row.welcomeEmailSentAt)
      return <Badge ok={true} label={`Sent ${new Date(row.welcomeEmailSentAt).toLocaleDateString()}`} />;
    if (transient?.sent)        return <Badge ok={true} label="Sent" />;
    if (transient?.alreadySent) return <Badge ok={true} label="Already Sent" />;
    if (transient?.errorMessage) return <Badge ok={false} label="Failed" />;
    return (
      <button onClick={() => row.userId && sendEmails([row.userId])} disabled={emailSending} style={s.btn('#b8923a', emailSending)}>
        ✉ Send
      </button>
    );
  };

  const odooStatusCell = (row: ImportSessionRow, field: 'investor' | 'investment') => {
    const transient = row.applicationId ? odooResults[row.applicationId] : undefined;
    if (!row.success) return <span style={{ color: '#94a3b8' }}>—</span>;
    const syncedAt = field === 'investor' ? row.odooInvestorSyncedAt : row.odooInvestmentSyncedAt;
    if (syncedAt)
      return <Badge ok={true} label={`Synced ${new Date(syncedAt).toLocaleDateString()}`} />;
    if (transient) {
      const ok = field === 'investor' ? transient.odooInvestorSynced : transient.odooInvestmentSynced;
      return <Badge ok={ok} label={ok ? 'Synced' : 'Failed'} />;
    }
    if (field === 'investor') {
      return (
        <button onClick={() => row.applicationId && syncOdoo([row.applicationId])} disabled={odooSyncing} style={s.btn('#0f2342', odooSyncing)}>
          ⚡ Sync
        </button>
      );
    }
    // Investment pending but investor already done — show a retry button
    if (row.odooInvestorSyncedAt) {
      return (
        <button onClick={() => row.applicationId && syncOdoo([row.applicationId])} disabled={odooSyncing} style={s.btn('#0f2342', odooSyncing)}>
          ⚡ Retry
        </button>
      );
    }
    return <span style={{ color: '#94a3b8' }}>Pending</span>;
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div style={s.page}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 style={{ ...s.h1, marginBottom: 0 }}>Import Session #{sessionId}</h1>
          <Link href="/historical-import/history" style={{ fontSize: 13, color: '#b8923a', fontWeight: 600, textDecoration: 'none' }}>
            ← All Sessions
          </Link>
        </div>

        {loading && <p style={{ color: '#64748b', fontSize: 13 }}>Loading…</p>}
        {error   && <p style={{ color: '#991b1b', fontSize: 13 }}>{error}</p>}

        {session && (
          <>
            <p style={s.sub}>
              {session.fileName} &nbsp;·&nbsp; {new Date(session.importedAt).toLocaleString()} &nbsp;·&nbsp;
              <span style={{ color: '#166534' }}>{session.succeeded} succeeded</span>
              {session.failed > 0 && <span style={{ color: '#991b1b' }}>&nbsp;·&nbsp;{session.failed} failed</span>}
            </p>

            <div style={s.card}>
              {/* Action bar */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {someSelected ? (
                  <>
                    <span style={{ fontSize: 13, color: '#64748b', marginRight: 4 }}>
                      {selected.size} row{selected.size !== 1 ? 's' : ''} selected
                    </span>
                    <button
                      onClick={() => sendEmails(emailTargets.map(r => r.userId!))}
                      disabled={emailSending || emailTargets.length === 0}
                      style={s.btn('#b8923a', emailSending || emailTargets.length === 0)}
                    >
                      {emailSending ? 'Sending…' : `✉ Send Welcome Emails (${emailTargets.length})`}
                    </button>
                    <button
                      onClick={() => syncOdoo(odooTargets.map(r => r.applicationId!))}
                      disabled={odooSyncing || odooTargets.length === 0}
                      style={s.btn('#0f2342', odooSyncing || odooTargets.length === 0)}
                    >
                      {odooSyncing ? 'Syncing…' : `⚡ Sync to Odoo (${odooTargets.length})`}
                    </button>
                    <button
                      onClick={() => setSelected(new Set())}
                      style={{ ...s.btn('#94a3b8'), background: 'none', color: '#64748b', border: '1px solid #d1d5db' }}
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>
                    Select rows below to send emails or sync to Odoo.
                  </span>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {/* Select-all checkbox */}
                      <th style={{ ...s.th, width: 36, textAlign: 'center' as const }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                          onChange={toggleAll}
                          style={{ cursor: 'pointer', width: 14, height: 14 }}
                        />
                      </th>
                      <SortableTh label="Row" sortKey="rowNumber" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                      <SortableTh label="Investor" sortKey="investorName" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                      <SortableTh label="Email" sortKey="userEmail" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                      <SortableTh label="Status" sortKey="success" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                      <SortableTh label="PPM Ref #" sortKey="ppmRefNo" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                      <th style={s.th}>Welcome Email</th>
                      <th style={s.th}>Odoo Investor</th>
                      <th style={s.th}>Odoo Investment</th>
                      <th style={s.th}>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...session.rows].sort((a, b) => {
                      const av = sortValue(a, sortField);
                      const bv = sortValue(b, sortField);
                      if (av < bv) return sortDir === 'asc' ? -1 : 1;
                      if (av > bv) return sortDir === 'asc' ? 1 : -1;
                      return 0;
                    }).map(row => {
                      const isSelected = selected.has(row.id);
                      return (
                        <tr
                          key={row.rowNumber}
                          style={{ background: isSelected ? '#fffbeb' : undefined, cursor: row.success ? 'pointer' : 'default' }}
                          onClick={() => row.success && toggleRow(row.id)}
                        >
                          <td style={{ ...s.td, textAlign: 'center' as const }} onClick={e => e.stopPropagation()}>
                            {row.success && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleRow(row.id)}
                                style={{ cursor: 'pointer', width: 14, height: 14 }}
                              />
                            )}
                          </td>
                          <td style={s.td}>{row.rowNumber}</td>
                          <td style={s.td}>{row.investorName ?? '—'}</td>
                          <td style={s.td}>{row.userEmail ?? '—'}</td>
                          <td style={s.td}>
                            <Badge ok={row.success} label={row.success ? 'Imported' : 'Failed'} />
                          </td>
                          <td style={s.td}>{row.ppmRefNo ?? '—'}</td>
                          <td style={s.td} onClick={e => e.stopPropagation()}>{emailStatusCell(row)}</td>
                          <td style={s.td} onClick={e => e.stopPropagation()}>{odooStatusCell(row, 'investor')}</td>
                          <td style={s.td} onClick={e => e.stopPropagation()}>{odooStatusCell(row, 'investment')}</td>
                          <td style={{ ...s.td, color: '#991b1b', fontSize: 12, maxWidth: 220, wordBreak: 'break-word' }}>
                            {row.errorMessage ?? (row.userId ? emailResults[row.userId]?.errorMessage : undefined) ?? ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
