'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { adminApi, type DocuSignEnvelopeItem, type DocuSignSigner } from '@/lib/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  Signer:       'Investor',
  SpouseSigner: 'Spouse',
};

function roleLabel(roleName: string): string {
  return ROLE_LABELS[roleName] ?? roleName;
}

function fmt(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function parseSigners(json?: string): DocuSignSigner[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

// ── Signer chip ───────────────────────────────────────────────────────────────

function SignerChip({ s }: { s: DocuSignSigner }) {
  const signed = s.status === 'completed' || s.status === 'signed';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20,
      background: signed ? '#ecfdf5' : '#fffbeb', border: `1px solid ${signed ? '#10b98133' : '#f59e0b33'}` }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: signed ? '#10b981' : '#f59e0b', flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#0f2342' }}>{roleLabel(s.roleName)}</div>
        <div style={{ fontSize: 10, color: '#64748b' }}>{s.name || s.email}</div>
        {signed
          ? <div style={{ fontSize: 10, color: '#10b981' }}>Signed {fmtTime(s.signedDateTime)}</div>
          : <div style={{ fontSize: 10, color: '#f59e0b' }}>{s.status}</div>
        }
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function EnvelopeRow({ item, onDateSynced }: { item: DocuSignEnvelopeItem; onDateSynced: (id: number, date: string) => void }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const completed = item.docuSignStatus === 'completed';
  const signers = parseSigners(item.docuSignSignersJson);

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

  return (
    <div style={{ borderBottom: '1px solid #f1f5f9', padding: '16px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>

        {/* Left */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Name + badge */}
          <div style={{ minWidth: 180 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              {item.recordType === 'Application'
                ? <Link href={`/applications/${item.applicationId}`}
                    style={{ fontWeight: 700, fontSize: 14, color: '#b8923a', textDecoration: 'none' }}>
                    {item.investorName || '(no name)'}
                  </Link>
                : <span style={{ fontWeight: 700, fontSize: 14, color: '#b8923a' }}>{item.investorName || '(no name)'}</span>
              }
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                background: item.recordType === 'Redemption' ? '#fef3c7' : '#e0f2fe',
                color: item.recordType === 'Redemption' ? '#92400e' : '#0369a1' }}>
                {item.recordType}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              {item.investorType}{item.maritalStatus === 'Married' ? ' · Married' : ''}
              {item.ppmRefNo ? ` · PPM ${item.ppmRefNo}` : ''}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.email}</div>
          </div>

          {/* Submitted */}
          <div style={{ minWidth: 100 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.04em' }}>Submitted</div>
            <div style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 500 }}>{fmt(item.submittedAt)}</div>
          </div>

          {/* Effective date (applications only) */}
          {item.recordType === 'Application' && (
            <div style={{ minWidth: 120 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.04em' }}>Effective Date</div>
              <div style={{ fontSize: 13, color: item.effectiveDate ? '#1a1a2e' : '#94a3b8', fontWeight: item.effectiveDate ? 500 : 400 }}>
                {item.effectiveDate ? fmt(item.effectiveDate) : 'Not set'}
              </div>
            </div>
          )}

          {/* Signing status — from database */}
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.04em', marginBottom: 6 }}>
              Signing Status
            </div>
            {completed ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {signers.map((s, i) => <SignerChip key={i} s={s} />)}
                </div>
                {item.docuSignCompletedAt && (
                  <div style={{ fontSize: 10, color: '#10b981', marginTop: 4, fontWeight: 600 }}>
                    ✓ Completed {fmtTime(item.docuSignCompletedAt)}
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                borderRadius: 20, background: '#fffbeb', border: '1px solid #f59e0b33' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>Awaiting signatures</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', minWidth: 160 }}>
          {completed && item.recordType === 'Application' && !item.effectiveDate && (
            <button onClick={syncDate} disabled={syncing}
              style={{ padding: '6px 14px', background: '#0f2342', border: 'none', borderRadius: 8,
                fontSize: 12, fontWeight: 600, color: '#fff',
                cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.7 : 1 }}>
              {syncing ? 'Setting…' : 'Set Effective Date'}
            </button>
          )}
          {syncMsg && (
            <span style={{ fontSize: 11, color: syncMsg.startsWith('Set') ? '#10b981' : '#ef4444', textAlign: 'right' }}>
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
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  useEffect(() => {
    adminApi.docuSignEnvelopes()
      .then(r => { if (r.success) setEnvelopes(r.data ?? []); })
      .finally(() => setLoading(false));
  }, []);

  const handleDateSynced = (appId: number, date: string) => {
    setEnvelopes(prev => prev.map(e => e.applicationId === appId ? { ...e, effectiveDate: date } : e));
  };

  const completedCount  = envelopes.filter(e => e.docuSignStatus === 'completed').length;
  const awaitingCount   = envelopes.filter(e => e.docuSignStatus !== 'completed').length;
  const pendingDateCount = envelopes.filter(e => e.recordType === 'Application' && !e.effectiveDate).length;

  const displayed = filter === 'pending'
    ? envelopes.filter(e => e.recordType === 'Application' && !e.effectiveDate)
    : filter === 'completed'
    ? envelopes.filter(e => e.docuSignStatus === 'completed')
    : envelopes;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px', maxWidth: 1200 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f2342', marginBottom: 4 }}>DocuSign Agreements</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            Signing status is updated automatically when DocuSign notifies this system via webhook.
          </p>
        </div>

        {/* Summary chips */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ padding: '8px 16px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>✓ {completedCount} Completed</span>
          </div>
          <div style={{ padding: '8px 16px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>⏳ {awaitingCount} Awaiting</span>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          {([['all', `All (${envelopes.length})`], ['completed', `Completed (${completedCount})`], ['pending', `Effective Date Not Set (${pendingDateCount})`]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: filter === val ? (val === 'pending' ? '#b8923a' : '#0f2342') : '#fff',
                color: filter === val ? '#fff' : '#475569',
                borderColor: filter === val ? (val === 'pending' ? '#b8923a' : '#0f2342') : '#e2e8f0' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, padding: '10px 16px', background: '#f8fafc',
          borderRadius: 8, border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Signer roles:</span>
          <span style={{ fontSize: 12, color: '#64748b' }}><b>Investor</b> = primary signer (role: Signer)</span>
          <span style={{ fontSize: 12, color: '#64748b' }}><b>Spouse</b> = married individual co-signer (role: SpouseSigner)</span>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: '0 20px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : displayed.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No records found.</div>
          ) : (
            displayed.map(item => (
              <EnvelopeRow key={`${item.recordType}-${item.applicationId}`} item={item} onDateSynced={handleDateSynced} />
            ))
          )}
        </div>

      </div>
    </AdminLayout>
  );
}
