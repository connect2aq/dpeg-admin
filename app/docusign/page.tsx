'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { adminApi, type DocuSignEnvelopeItem, type DocuSignEnvelopeStatus, type DocuSignRecipient } from '@/lib/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  Signer:       'Investor',
  SpouseSigner: 'Spouse',
};

function roleLabel(roleName: string): string {
  return ROLE_LABELS[roleName] ?? roleName;
}

function statusColor(status: string): string {
  if (status === 'completed' || status === 'signed') return '#10b981';
  if (status === 'declined' || status === 'voided')  return '#ef4444';
  return '#f59e0b';
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function fmt(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Recipient chip ────────────────────────────────────────────────────────────

function RecipientChip({ r }: { r: DocuSignRecipient }) {
  const color = statusColor(r.status);
  const isSigned = r.status === 'completed' || r.status === 'signed';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, background: isSigned ? '#ecfdf5' : '#fffbeb', border: `1px solid ${color}22` }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#0f2342' }}>{roleLabel(r.roleName)}</div>
        <div style={{ fontSize: 10, color: '#64748b' }}>{r.name || r.email}</div>
        {isSigned
          ? <div style={{ fontSize: 10, color: '#10b981' }}>Signed {fmtTime(r.signedAt)}</div>
          : <div style={{ fontSize: 10, color: '#f59e0b' }}>{statusLabel(r.status)}</div>
        }
      </div>
    </div>
  );
}

// ── Row status panel (lazy loaded) ───────────────────────────────────────────

type RowStatus = { loading: boolean; data: DocuSignEnvelopeStatus | null; error: string | null };

function EnvelopeStatusRow({ item, onDateSynced }: { item: DocuSignEnvelopeItem; onDateSynced: (id: number, date: string) => void }) {
  const [status, setStatus] = useState<RowStatus>({ loading: false, data: null, error: null });
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const load = useCallback(async () => {
    setStatus({ loading: true, data: null, error: null });
    const r = await adminApi.docuSignEnvelopeStatus(item.envelopeId);
    if (r.success) setStatus({ loading: false, data: r.data, error: null });
    else setStatus({ loading: false, data: null, error: r.message || 'Failed to load' });
  }, [item.envelopeId]);

  const syncDate = async () => {
    setSyncing(true);
    setSyncMsg('');
    const r = await adminApi.syncDocuSignDate(item.applicationId);
    if (r.success) {
      setSyncMsg(`Set to ${r.data}`);
      onDateSynced(item.applicationId, r.data);
    } else {
      setSyncMsg(r.message || 'Failed');
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 5000);
  };

  const allSigned = status.data
    ? status.data.recipients.length > 0 && status.data.recipients.every(r => r.status === 'completed' || r.status === 'signed')
    : false;

  const hasPending = status.data
    ? status.data.recipients.some(r => r.status !== 'completed' && r.status !== 'signed' && r.status !== 'declined' && r.status !== 'voided')
    : false;

  return (
    <div style={{ borderBottom: '1px solid #f1f5f9', padding: '16px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
        {/* Left: applicant info */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 180 }}>
            <Link href={`/applications/${item.applicationId}`}
              style={{ fontWeight: 700, fontSize: 14, color: '#b8923a', textDecoration: 'none' }}>
              {item.investorName || '(no name)'}
            </Link>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {item.investorType} {item.maritalStatus === 'Married' ? '· Married' : ''}
              {item.ppmRefNo ? ` · PPM ${item.ppmRefNo}` : ''}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.email}</div>
          </div>

          <div style={{ minWidth: 100 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.04em' }}>Submitted</div>
            <div style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 500 }}>{fmt(item.submittedAt)}</div>
          </div>

          <div style={{ minWidth: 120 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.04em' }}>Effective Date</div>
            <div style={{ fontSize: 13, color: item.effectiveDate ? '#1a1a2e' : '#94a3b8', fontWeight: item.effectiveDate ? 500 : 400 }}>
              {item.effectiveDate ? fmt(item.effectiveDate) : 'Not set'}
            </div>
          </div>

          {/* DocuSign status block */}
          {status.data && (
            <div style={{ minWidth: 200 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.04em', marginBottom: 6 }}>Signing Status</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {status.data.recipients.map((r, i) => <RecipientChip key={i} r={r} />)}
              </div>
              {status.data.lastSignerDate && (
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                  Last signed: {fmtTime(status.data.lastSignerDate)}
                </div>
              )}
            </div>
          )}

          {status.loading && (
            <div style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>Loading status…</div>
          )}
          {status.error && (
            <div style={{ fontSize: 12, color: '#ef4444', alignSelf: 'center' }}>{status.error}</div>
          )}
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', minWidth: 140 }}>
          {!status.data && !status.loading && (
            <button onClick={load}
              style={{ padding: '6px 14px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
              Check Status
            </button>
          )}
          {status.data && !status.loading && (
            <button onClick={load}
              style={{ padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}>
              Refresh
            </button>
          )}
          {status.data && allSigned && (
            <button onClick={syncDate} disabled={syncing}
              style={{ padding: '6px 14px', background: '#0f2342', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#fff', cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.7 : 1 }}>
              {syncing ? 'Setting…' : 'Set Effective Date'}
            </button>
          )}
          {hasPending && (
            <a href={`mailto:${item.email}`}
              style={{ padding: '6px 14px', background: '#fefce8', border: '1.5px solid #fde047', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#92400e', textDecoration: 'none', textAlign: 'center' }}>
              Contact
            </a>
          )}
          {syncMsg && (
            <span style={{ fontSize: 11, color: syncMsg.startsWith('Set') || syncMsg.startsWith('set') ? '#10b981' : '#ef4444', textAlign: 'right' }}>
              {syncMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DocuSignPage() {
  const [envelopes, setEnvelopes] = useState<DocuSignEnvelopeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending'>('all');

  useEffect(() => {
    adminApi.docuSignEnvelopes()
      .then(r => { if (r.success) setEnvelopes(r.data ?? []); })
      .finally(() => setLoading(false));
  }, []);

  const handleDateSynced = (appId: number, date: string) => {
    setEnvelopes(prev => prev.map(e => e.applicationId === appId ? { ...e, effectiveDate: date } : e));
  };

  const displayed = filter === 'pending'
    ? envelopes.filter(e => !e.effectiveDate)
    : envelopes;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f2342', marginBottom: 4 }}>DocuSign Agreements</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            Monitor signing status for each application. Use "Check Status" to fetch live data from DocuSign, then "Set Effective Date" once all parties have signed.
          </p>
        </div>

        {/* Filters + summary */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <button onClick={() => setFilter('all')}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: filter === 'all' ? '#0f2342' : '#fff', color: filter === 'all' ? '#fff' : '#475569', borderColor: filter === 'all' ? '#0f2342' : '#e2e8f0' }}>
            All ({envelopes.length})
          </button>
          <button onClick={() => setFilter('pending')}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: filter === 'pending' ? '#b8923a' : '#fff', color: filter === 'pending' ? '#fff' : '#475569', borderColor: filter === 'pending' ? '#b8923a' : '#e2e8f0' }}>
            Effective Date Not Set ({envelopes.filter(e => !e.effectiveDate).length})
          </button>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, padding: '10px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Signer roles:</span>
          <span style={{ fontSize: 12, color: '#64748b' }}><b>Investor</b> = primary signer (role: Signer)</span>
          <span style={{ fontSize: 12, color: '#64748b' }}><b>Spouse</b> = married individual co-signer (role: SpouseSigner)</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>Entity applications show the authorised signatory as Investor</span>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: '0 20px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : displayed.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              {filter === 'pending' ? 'All applications have an effective date set.' : 'No DocuSign envelopes found. They are stored once an application is submitted.'}
            </div>
          ) : (
            displayed.map(item => (
              <EnvelopeStatusRow key={item.applicationId} item={item} onDateSynced={handleDateSynced} />
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
