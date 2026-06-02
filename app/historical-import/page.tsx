'use client';
import { useRef, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import {
  historicalImportApi,
  type ImportResult,
  type ImportRowResult,
  type WelcomeEmailResult,
  type OdooSyncResult,
  type OdooSyncRowResult,
  type WelcomeEmailRowResult,
} from '@/lib/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12,
      fontWeight: 600,
      background: ok ? '#dcfce7' : '#fee2e2',
      color: ok ? '#166534' : '#991b1b',
    }}>{label}</span>
  );
}

function exportToCsv(rows: object[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => {
        const v = String((r as Record<string, unknown>)[h] ?? '');
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HistoricalImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading]     = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError]  = useState('');

  // Phase 2 — welcome email state per userId
  const [emailSending, setEmailSending]  = useState(false);
  const [emailResults, setEmailResults]  = useState<Record<number, WelcomeEmailRowResult>>({});

  // Phase 3 — Odoo sync state per applicationId
  const [odooSyncing, setOdooSyncing]   = useState(false);
  const [odooResults, setOdooResults]   = useState<Record<number, OdooSyncRowResult>>({});

  const [showInstructions, setShowInstructions] = useState(false);

  const successRows = importResult?.rows.filter(r => r.success) ?? [];

  // ── Step 1: upload ──────────────────────────────────────────────────────────

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setImportError('Please select a .xlsx file first.'); return; }
    setUploading(true);
    setImportError('');
    setImportResult(null);
    setEmailResults({});
    setOdooResults({});
    try {
      const res = await historicalImportApi.upload(file);
      if (res.success) setImportResult(res.data);
      else setImportError(res.message || 'Upload failed.');
    } catch {
      setImportError('Network error. Please try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDownloadTemplate = async () => {
    const res = await historicalImportApi.downloadTemplate();
    if (!res.ok) return;
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'HistoricalImportTemplate.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Step 2: send welcome emails ─────────────────────────────────────────────

  const sendEmails = async (userIds: number[]) => {
    setEmailSending(true);
    try {
      const res = await historicalImportApi.sendWelcomeEmails(userIds);
      if (res.success) {
        const map: Record<number, WelcomeEmailRowResult> = { ...emailResults };
        res.data.rows.forEach(r => { map[r.userId] = r; });
        setEmailResults(map);
      }
    } catch {/* ignore */}
    finally { setEmailSending(false); }
  };

  const sendAllEmails = () => {
    const ids = successRows
      .filter(r => r.userId && !emailResults[r.userId!]?.sent && !emailResults[r.userId!]?.alreadySent)
      .map(r => r.userId!);
    if (ids.length) sendEmails(ids);
  };

  // ── Step 3: Odoo sync ───────────────────────────────────────────────────────

  const syncOdoo = async () => {
    const ids = successRows.map(r => r.applicationId).filter(Boolean) as number[];
    if (!ids.length) return;
    setOdooSyncing(true);
    try {
      const res = await historicalImportApi.syncToOdoo(ids);
      if (res.success) {
        const map: Record<number, OdooSyncRowResult> = {};
        res.data.rows.forEach(r => { map[r.applicationId] = r; });
        setOdooResults(map);
      }
    } catch {/* ignore */}
    finally { setOdooSyncing(false); }
  };

  // ── Styles ──────────────────────────────────────────────────────────────────

  const s = {
    page: { padding: '32px 0' } as React.CSSProperties,
    h1:   { fontSize: 22, fontWeight: 700, color: '#0f2342', marginBottom: 4 } as React.CSSProperties,
    sub:  { color: '#64748b', fontSize: 14, marginBottom: 28 } as React.CSSProperties,
    card: {
      background: '#fff', border: '1px solid var(--border)',
      borderRadius: 8, padding: '20px 24px', marginBottom: 20,
    } as React.CSSProperties,
    cardTitle: { fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 12 } as React.CSSProperties,
    btn: (color: string, disabled?: boolean): React.CSSProperties => ({
      padding: '8px 18px', borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: 13, fontWeight: 600, background: disabled ? '#d1d5db' : color, color: '#fff',
      opacity: disabled ? 0.7 : 1,
    }),
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
    th: {
      padding: '8px 12px', textAlign: 'left' as const, background: '#0f2342',
      color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const,
    },
    td: { padding: '8px 12px', borderBottom: '1px solid #f1f5f9', color: '#1a1a2e' },
  };

  return (
    <AdminLayout>
      <div style={s.page}>
        <h1 style={s.h1}>Historical Import</h1>
        <p style={s.sub}>
          Load historical investor records directly at Active status — no DocuSign, no approval workflow.
          Follow the three steps below in order.
        </p>

        {/* Instructions */}
        <div style={s.card}>
          <button
            onClick={() => setShowInstructions(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600,
              fontSize: 14, color: '#0f2342', padding: 0 }}
          >
            {showInstructions ? '▾' : '▸'} Instructions
          </button>
          {showInstructions && (
            <div style={{ marginTop: 12, fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
              <p><strong>Step 1 — Upload:</strong> Download the template, fill in investor data, and upload the .xlsx file.
                Records are saved directly at <em>Active</em> status. No DocuSign envelopes are created and no emails are sent to investors at this stage.</p>
              <p><strong>Step 2 — Welcome Emails:</strong> After verifying the loaded data, send each investor a welcome email
                with a password-setup link. You can send individually or in bulk. The system prevents duplicate sends.</p>
              <p><strong>Step 3 — Odoo Sync:</strong> Once satisfied with the portal data, push all records to Odoo Financials
                via the integration API. This can be retried independently if any records fail.</p>
            </div>
          )}
        </div>

        {/* Step 1 — Upload */}
        <div style={s.card}>
          <div style={s.cardTitle}>Step 1 — Upload Investor Data</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleDownloadTemplate} style={s.btn('#475569')}>
              ↓ Download Template
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              style={{ fontSize: 13, color: '#374151' }}
            />
            <button
              onClick={handleUpload}
              disabled={uploading}
              style={s.btn('#0f2342', uploading)}
            >
              {uploading ? 'Importing…' : '⬆ Import'}
            </button>
          </div>
          {importError && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fee2e2',
              border: '1px solid #fca5a5', borderRadius: 6, color: '#991b1b', fontSize: 13 }}>
              {importError}
            </div>
          )}
        </div>

        {/* Results table */}
        {importResult && (
          <div style={s.card}>
            {/* Summary bar */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#0f2342', fontSize: 15 }}>
                Import Results
              </span>
              <span style={{ fontSize: 13, color: '#64748b' }}>
                Total: <strong>{importResult.totalRows}</strong> &nbsp;|&nbsp;
                <span style={{ color: '#166534' }}>Succeeded: <strong>{importResult.succeeded}</strong></span> &nbsp;|&nbsp;
                <span style={{ color: '#991b1b' }}>Failed: <strong>{importResult.failed}</strong></span>
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button
                  onClick={() => exportToCsv(importResult.rows, 'import-results.csv')}
                  style={s.btn('#475569')}
                >
                  Export CSV
                </button>
                {successRows.length > 0 && (
                  <button
                    onClick={sendAllEmails}
                    disabled={emailSending}
                    style={s.btn('#b8923a', emailSending)}
                  >
                    {emailSending ? 'Sending…' : `✉ Send All Welcome Emails (${successRows.length})`}
                  </button>
                )}
                {successRows.length > 0 && (
                  <button
                    onClick={syncOdoo}
                    disabled={odooSyncing}
                    style={s.btn('#0f2342', odooSyncing)}
                  >
                    {odooSyncing ? 'Syncing…' : '⚡ Sync All to Odoo'}
                  </button>
                )}
              </div>
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
                  {importResult.rows.map(row => {
                    const emailRow  = row.userId ? emailResults[row.userId] : undefined;
                    const odooRow   = row.applicationId ? odooResults[row.applicationId] : undefined;
                    return (
                      <tr key={row.rowNumber}>
                        <td style={s.td}>{row.rowNumber}</td>
                        <td style={s.td}>{row.investorName ?? '—'}</td>
                        <td style={s.td}>{row.userEmail ?? '—'}</td>
                        <td style={s.td}>
                          <Badge ok={row.success} label={row.success ? 'Imported' : 'Failed'} />
                        </td>
                        <td style={s.td}>{row.ppmRefNO ?? '—'}</td>

                        {/* Welcome email cell */}
                        <td style={s.td}>
                          {!row.success ? (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          ) : emailRow?.sent ? (
                            <Badge ok={true} label="Sent" />
                          ) : emailRow?.alreadySent ? (
                            <Badge ok={true} label="Already Sent" />
                          ) : emailRow?.errorMessage ? (
                            <Badge ok={false} label="Failed" />
                          ) : (
                            <button
                              onClick={() => row.userId && sendEmails([row.userId])}
                              disabled={emailSending}
                              style={s.btn('#b8923a', emailSending)}
                            >
                              ✉ Send
                            </button>
                          )}
                        </td>

                        {/* Odoo investor cell */}
                        <td style={s.td}>
                          {!row.success ? <span style={{ color: '#94a3b8' }}>—</span>
                            : odooRow
                              ? <Badge ok={odooRow.odooInvestorSynced} label={odooRow.odooInvestorSynced ? 'Synced' : 'Failed'} />
                              : <span style={{ color: '#94a3b8' }}>Pending</span>}
                        </td>

                        {/* Odoo investment cell */}
                        <td style={s.td}>
                          {!row.success ? <span style={{ color: '#94a3b8' }}>—</span>
                            : odooRow
                              ? <Badge ok={odooRow.odooInvestmentSynced} label={odooRow.odooInvestmentSynced ? 'Synced' : 'Failed'} />
                              : <span style={{ color: '#94a3b8' }}>Pending</span>}
                        </td>

                        {/* Error cell */}
                        <td style={{ ...s.td, color: '#991b1b', fontSize: 12, maxWidth: 220, wordBreak: 'break-word' }}>
                          {row.errorMessage ?? odooRow?.errorMessage ?? ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
