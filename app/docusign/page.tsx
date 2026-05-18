'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { adminApi, type DocuSignEnvelopeItem, type DocuSignSigner } from '@/lib/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const ROLE_LABELS: Record<string, string> = {
  Signer:       'Investor',
  SpouseSigner: 'Spouse',
};

function roleLabel(roleName: string): string {
  return ROLE_LABELS[roleName] ?? roleName;
}

function isSignerDone(s: DocuSignSigner): boolean {
  return s.status === 'completed' || s.status === 'signed';
}

// ── Timeline step types ───────────────────────────────────────────────────────

type StepState = 'done' | 'pending';

interface TimelineStep {
  label: string;
  sublabel?: string;
  timestamp?: string;
  state: StepState;
}

// ── Build steps from envelope item ───────────────────────────────────────────

function buildSteps(item: DocuSignEnvelopeItem): TimelineStep[] {
  const signers = parseSigners(item.docuSignSignersJson);
  const envelopeStatus = item.docuSignStatus ?? '';
  const isSentOrBeyond = ['sent', 'delivered', 'completed'].includes(envelopeStatus.toLowerCase());

  const investor  = signers.find(s => s.roleName === 'Signer');
  const spouse    = signers.find(s => s.roleName === 'SpouseSigner');
  // Any role that is neither Signer nor SpouseSigner is treated as the final owner/counter-signer
  const owner     = signers.find(s => s.roleName !== 'Signer' && s.roleName !== 'SpouseSigner');

  const steps: TimelineStep[] = [];

  // Step 1: Created & Sent
  steps.push({
    label:     'Created',
    timestamp: item.submittedAt ? fmtTime(item.submittedAt) : undefined,
    state:     'done', // envelope always exists if it's in this list
  });

  steps.push({
    label:     'Sent',
    timestamp: item.submittedAt ? fmtTime(item.submittedAt) : undefined,
    state:     isSentOrBeyond ? 'done' : 'pending',
  });

  // Step 3: Investor signs
  const investorDone = investor ? isSignerDone(investor) : false;
  steps.push({
    label:     'Investor Signed',
    sublabel:  investor?.name || investor?.email,
    timestamp: investorDone ? fmtTime(investor?.signedDateTime) : undefined,
    state:     investorDone ? 'done' : 'pending',
  });

  // Step 4: Spouse signs (only for married)
  if (item.maritalStatus === 'Married' || spouse) {
    const spouseDone = spouse ? isSignerDone(spouse) : false;
    steps.push({
      label:     'Spouse Signed',
      sublabel:  spouse?.name || spouse?.email,
      timestamp: spouseDone ? fmtTime(spouse?.signedDateTime) : undefined,
      state:     spouseDone ? 'done' : 'pending',
    });
  }

  // Step 5: Owner/counter-signer (only if role present in data)
  if (owner) {
    const ownerDone = isSignerDone(owner);
    steps.push({
      label:     roleLabel(owner.roleName),
      sublabel:  owner.name || owner.email,
      timestamp: ownerDone ? fmtTime(owner.signedDateTime) : undefined,
      state:     ownerDone ? 'done' : 'pending',
    });
  }

  // Step 6: Completed
  steps.push({
    label:     'Completed',
    timestamp: item.docuSignCompletedAt ? fmtTime(item.docuSignCompletedAt) : undefined,
    state:     envelopeStatus.toLowerCase() === 'completed' ? 'done' : 'pending',
  });

  return steps;
}

// ── SigningTimeline ───────────────────────────────────────────────────────────

function SigningTimeline({ item }: { item: DocuSignEnvelopeItem }) {
  const steps = buildSteps(item);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, flexWrap: 'wrap', rowGap: 12 }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start' }}>
          {/* Step node */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 90 }}>
            {/* Circle */}
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: step.state === 'done' ? '#10b981' : '#f1f5f9',
              border: `2px solid ${step.state === 'done' ? '#10b981' : '#cbd5e1'}`,
              flexShrink: 0,
            }}>
              {step.state === 'done'
                ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5L5 9.5L11 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#cbd5e1' }} />
              }
            </div>
            {/* Label */}
            <div style={{ marginTop: 5, textAlign: 'center', maxWidth: 86 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: step.state === 'done' ? '#0f2342' : '#94a3b8', lineHeight: 1.3 }}>
                {step.label}
              </div>
              {step.sublabel && (
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1, lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {step.sublabel}
                </div>
              )}
              {step.timestamp && (
                <div style={{ fontSize: 9, color: step.state === 'done' ? '#10b981' : '#94a3b8', marginTop: 1, lineHeight: 1.3 }}>
                  {step.timestamp}
                </div>
              )}
            </div>
          </div>

          {/* Connector line (not after last step) */}
          {i < steps.length - 1 && (
            <div style={{
              width: 28, height: 2, marginTop: 13, flexShrink: 0,
              background: step.state === 'done' ? '#10b981' : '#e2e8f0',
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function EnvelopeRow({ item, onDateSynced }: { item: DocuSignEnvelopeItem; onDateSynced: (id: number, date: string) => void }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const completed = item.docuSignStatus === 'completed';

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Top row: name + meta */}
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
          </div>

          {/* Signing timeline */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.04em', marginBottom: 8 }}>
              Signing Progress
            </div>
            <SigningTimeline item={item} />
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

  const completedCount   = envelopes.filter(e => e.docuSignStatus === 'completed').length;
  const awaitingCount    = envelopes.filter(e => e.docuSignStatus !== 'completed').length;
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
            Signing progress is updated automatically at each step via DocuSign webhooks.
          </p>
        </div>

        {/* Summary chips */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ padding: '8px 16px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>✓ {completedCount} Completed</span>
          </div>
          <div style={{ padding: '8px 16px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>⏳ {awaitingCount} In Progress</span>
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
