'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import {
  historicalImportApi,
  type ImportSessionDetail,
  type ImportSessionRow,
  type WelcomeEmailRowResult,
  type OdooSyncRowResult,
} from '@/lib/api';

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

  const [session, setSession]       = useState<ImportSessionDetail | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Per-row transient action results (in-memory, not persisted until refresh)
  const [emailSending, setEmailSending] = useState(false);
  const [emailResults, setEmailResults] = useState<Record<number, WelcomeEmailRowResult>>({});
  const [odooSyncing, setOdooSyncing]   = useState(false);
  const [odooResults, setOdooResults]   = useState<Record<number, OdooSyncRowResult>>({});

  const load = () => {
    setLoading(true);
    historicalImportApi.getSessionDetail(sessionId)
      .then(res => {
        if (res.success) setSession(res.data);
        else setError(res.message || 'Session not found.');
      })
      .catch(() => setError('Network error. Please try again.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [sessionId]);

  const successRows = session?.rows.filter(r => r.success) ?? [];

  // ── Send emails ──────────────────────────────────────────────────────────────

  const sendEmails = async (userIds: number[]) => {
    setEmailSending(true);
    try {
      const res = await historicalImportApi.sendWelcomeEmails(userIds);
      if (res.success) {
        const map: Record<number, WelcomeEmailRowResult> = { ...emailResults };
        res.data.rows.forEach(r => { map[r.userId] = r; });
        setEmailResults(map);
        // Refresh session to get updated WelcomeEmailSentAt timestamps
        load();
      }
    } catch {/* ignore */}
    finally { setEmailSending(false); }
  };

  const sendAllEmails = () => {
    const ids = successRows
      .filter(r => r.userId && !r.welcomeEmailSentAt && !emailResults[r.userId!]?.sent && !emailResults[r.userId!]?.alreadySent)
      .map(r => r.userId!);
    if (ids.length) sendEmails(ids);
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
        // Refresh session to get updated Odoo timestamps
        load();
      }
    } catch {/* ignore */}
    finally { setOdooSyncing(false); }
  };

  const syncAllOdoo = () => {
    const ids = successRows
      .filter(r => r.applicationId && !r.odooInvestorSyncedAt && !odooResults[r.applicationId!])
      .map(r => r.applicationId!);
    if (ids.length) syncOdoo(ids);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const emailPendingCount = successRows.filter(r =>
    r.userId && !r.welcomeEmailSentAt && !emailResults[r.userId!]?.sent && !emailResults[r.userId!]?.alreadySent
  ).length;

  const odooPendingCount = successRows.filter(r =>
    r.applicationId && !r.odooInvestorSyncedAt && !odooResults[r.applicationId!]
  ).length;

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

  const emailStatusCell = (row: ImportSessionRow) => {
    const transient = row.userId ? emailResults[row.userId] : undefined;
    if (!row.success) return <span style={{ color: '#94a3b8' }}>—</span>;
    if (row.welcomeEmailSentAt)
      return <Badge ok={true} label={`Sent ${new Date(row.welcomeEmailSentAt).toLocaleDateString()}`} />;
    if (transient?.sent)      return <Badge ok={true} label="Sent" />;
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

    // Show sync button only in investor column; investment is always bulk
    if (field === 'investor') {
      return (
        <button onClick={() => row.applicationId && syncOdoo([row.applicationId])} disabled={odooSyncing} style={s.btn('#0f2342', odooSyncing)}>
          ⚡ Sync
        </button>
      );
    }
    return <span style={{ color: '#94a3b8' }}>Pending</span>;
  };

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
              {/* Bulk action bar */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                {emailPendingCount > 0 && (
                  <button onClick={sendAllEmails} disabled={emailSending} style={s.btn('#b8923a', emailSending)}>
                    {emailSending ? 'Sending…' : `✉ Send All Welcome Emails (${emailPendingCount})`}
                  </button>
                )}
                {odooPendingCount > 0 && (
                  <button onClick={syncAllOdoo} disabled={odooSyncing} style={s.btn('#0f2342', odooSyncing)}>
                    {odooSyncing ? 'Syncing…' : `⚡ Sync All to Odoo (${odooPendingCount})`}
                  </button>
                )}
                {emailPendingCount === 0 && odooPendingCount === 0 && successRows.length > 0 && (
                  <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>
                    ✓ All actions complete for this session
                  </span>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Row</th>
                      <th style={s.th}>Investor</th>
                      <th style={s.th}>Email</th>
                      <th style={s.th}>Status</th>
                      <th style={s.th}>PPM Ref #</th>
                      <th style={s.th}>Welcome Email</th>
                      <th style={s.th}>Odoo Investor</th>
                      <th style={s.th}>Odoo Investment</th>
                      <th style={s.th}>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.rows.map(row => (
                      <tr key={row.rowNumber}>
                        <td style={s.td}>{row.rowNumber}</td>
                        <td style={s.td}>{row.investorName ?? '—'}</td>
                        <td style={s.td}>{row.userEmail ?? '—'}</td>
                        <td style={s.td}>
                          <Badge ok={row.success} label={row.success ? 'Imported' : 'Failed'} />
                        </td>
                        <td style={s.td}>{row.ppmRefNo ?? '—'}</td>
                        <td style={s.td}>{emailStatusCell(row)}</td>
                        <td style={s.td}>{odooStatusCell(row, 'investor')}</td>
                        <td style={s.td}>{odooStatusCell(row, 'investment')}</td>
                        <td style={{ ...s.td, color: '#991b1b', fontSize: 12, maxWidth: 220, wordBreak: 'break-word' }}>
                          {row.errorMessage ?? ''}
                        </td>
                      </tr>
                    ))}
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
