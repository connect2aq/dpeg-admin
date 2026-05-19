'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { adminApi, type RedemptionDetail, type DocuSignEnvelopeStatus } from '@/lib/api';

const STATUSES = ['UnderReview', 'Active', 'Rejected', 'Redeemed'];

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#1a1a2e', fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#b8923a', marginBottom: 10, marginTop: 18, paddingBottom: 4, borderBottom: '1px solid #f1f5f9' }}>
      {children}
    </div>
  );
}

export default function RedemptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [redemption, setRedemption] = useState<RedemptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState('');

  const [dsStatus, setDsStatus] = useState<DocuSignEnvelopeStatus | null>(null);
  const [dsLoading, setDsLoading] = useState(false);
  const [dsError, setDsError] = useState('');
  const [dsSending, setDsSending] = useState(false);
  const [dsSendMsg, setDsSendMsg] = useState('');

  useEffect(() => {
    adminApi.redemption(Number(id))
      .then(r => {
        if (r.success) {
          setRedemption(r.data);
          setNewStatus(r.data.status);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const updateStatus = async () => {
    if (!redemption || newStatus === redemption.status) return;
    setUpdating(true);
    const r = await adminApi.updateRedemptionStatus(redemption.id, newStatus);
    setMsg(r.success ? 'Status updated.' : r.message);
    if (r.success) setRedemption(a => a ? { ...a, status: newStatus } : a);
    setUpdating(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const loadDsStatus = async () => {
    if (!redemption?.docuSignEnvelopeId) return;
    setDsLoading(true); setDsError('');
    const r = await adminApi.docuSignEnvelopeStatus(redemption.docuSignEnvelopeId);
    if (r.success) setDsStatus(r.data);
    else setDsError(r.message || 'Failed to load');
    setDsLoading(false);
  };

  const sendDsEnvelope = async () => {
    if (!redemption) return;
    setDsSending(true); setDsSendMsg('');
    const r = await adminApi.sendRedemptionDocuSignEnvelope(redemption.id);
    if (r.success) {
      setRedemption(a => a ? { ...a, docuSignStatus: 'sent', docuSignSentAt: new Date().toISOString() } : a);
      setDsSendMsg('Sent to signers.');
    } else {
      setDsSendMsg(r.message || 'Failed to send');
    }
    setDsSending(false);
    setTimeout(() => setDsSendMsg(''), 5000);
  };

  if (loading) return <AdminLayout><div style={{ padding: 40, color: '#64748b' }}>Loading...</div></AdminLayout>;
  if (!redemption) return <AdminLayout><div style={{ padding: 40 }}><p style={{ color: '#ef4444' }}>Redemption not found.</p></div></AdminLayout>;

  const dbSigners = (() => {
    try { return redemption.docuSignSignersJson ? JSON.parse(redemption.docuSignSignersJson) : null; } catch { return null; }
  })();
  const displayStatus = dsStatus ? dsStatus.envelopeStatus : redemption.docuSignStatus;
  const isCompleted = displayStatus === 'completed';
  const roleMap: Record<string, string> = { Signer: 'Investor', SpouseSigner: 'Spouse' };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px', maxWidth: 960 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
          <Link href="/redemptions" style={{ color: '#b8923a', textDecoration: 'none' }}>Redemptions</Link> / #{redemption.id}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f2342' }}>Redemption #{redemption.id}</h1>
            <p style={{ color: '#64748b', marginTop: 4 }}>
              {redemption.investorType} · {redemption.email ?? 'No email'}
            </p>
          </div>
          <StatusBadge status={redemption.status} />
        </div>

        {/* Status management */}
        <div className="card" style={{ marginBottom: 20 }}>
          <SectionLabel>Update Status</SectionLabel>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
              style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={updateStatus} disabled={updating || newStatus === redemption.status}
              style={{ padding: '8px 18px', background: '#0f2342', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: updating || newStatus === redemption.status ? 'default' : 'pointer', opacity: updating || newStatus === redemption.status ? 0.5 : 1 }}>
              {updating ? 'Saving…' : 'Save Status'}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg === 'Status updated.' ? '#10b981' : '#ef4444' }}>{msg}</span>}
          </div>
        </div>

        {/* Partner / investor info */}
        <div className="card" style={{ marginBottom: 20 }}>
          <SectionLabel>Partner Information</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px 24px' }}>
            <InfoRow label="Selling Partner Name" value={redemption.sellingPartnerName} />
            <InfoRow label="Investor Type" value={redemption.investorType} />
            <InfoRow label="Entity Name" value={redemption.entityName} />
            <InfoRow label="Signatory Name" value={redemption.signatoryName} />
            <InfoRow label="Signatory Title" value={redemption.signatoryTitle} />
            <InfoRow label="Printed Name" value={redemption.printedName} />
            <InfoRow label="Email" value={redemption.email} />
          </div>

          {(redemption.addressLine1 || redemption.addressLine2 || redemption.addressLine3) && (
            <>
              <SectionLabel>Address</SectionLabel>
              <div style={{ fontSize: 14, color: '#1a1a2e', fontWeight: 500, lineHeight: 1.6 }}>
                {redemption.addressLine1 && <div>{redemption.addressLine1}</div>}
                {redemption.addressLine2 && <div>{redemption.addressLine2}</div>}
                {redemption.addressLine3 && <div>{redemption.addressLine3}</div>}
              </div>
            </>
          )}
        </div>

        {/* Redemption details */}
        <div className="card" style={{ marginBottom: 20 }}>
          <SectionLabel>Redemption Details</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px 24px' }}>
            <InfoRow label="Units to Redeem" value={redemption.unitsToRedeem} />
            <InfoRow label="Total Units Owned" value={redemption.totalUnitsOwned} />
            <InfoRow label="Aggregate Purchase Price" value={redemption.aggregatePurchasePrice ? `$${Number(redemption.aggregatePurchasePrice).toLocaleString()}` : undefined} />
            <InfoRow label="Prorated Preferred Return" value={redemption.proratedPreferredReturn} />
            <InfoRow label="Original Purchase Date" value={redemption.originalPurchaseDate} />
            <InfoRow label="Effective Date" value={redemption.effectiveDate} />
            <InfoRow label="Submitted" value={new Date(redemption.createdOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
            {redemption.trancheApplicationId && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 3 }}>Linked Application</div>
                <Link href={`/applications/${redemption.trancheApplicationId}`} style={{ fontSize: 14, fontWeight: 600, color: '#b8923a', textDecoration: 'none' }}>
                  Application #{redemption.trancheApplicationId} →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* DocuSign section */}
        {redemption.docuSignEnvelopeId && (
          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342' }}>DocuSign Agreement</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {(!redemption.docuSignStatus || redemption.docuSignStatus === 'created') &&
                  !['sent', 'completed', 'delivered'].includes(dsStatus?.envelopeStatus ?? '') && (
                  <button onClick={sendDsEnvelope} disabled={dsSending}
                    style={{ padding: '6px 14px', background: '#10b981', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#fff', cursor: dsSending ? 'default' : 'pointer', opacity: dsSending ? 0.7 : 1 }}>
                    {dsSending ? 'Sending…' : 'Send to Signers'}
                  </button>
                )}
                {dsSendMsg && (
                  <span style={{ fontSize: 12, color: dsSendMsg === 'Sent to signers.' ? '#10b981' : '#ef4444' }}>{dsSendMsg}</span>
                )}
                <button onClick={loadDsStatus} disabled={dsLoading}
                  style={{ padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, color: '#94a3b8', cursor: dsLoading ? 'default' : 'pointer', opacity: dsLoading ? 0.6 : 1 }}>
                  {dsLoading ? 'Refreshing…' : 'Refresh from DocuSign'}
                </button>
              </div>
            </div>

            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
              Envelope ID: <span style={{ fontFamily: 'monospace', color: '#475569' }}>{redemption.docuSignEnvelopeId}</span>
            </div>

            {dsError && <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 8 }}>{dsError}</div>}

            {displayStatus && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: isCompleted ? '#ecfdf5' : '#fffbeb', color: isCompleted ? '#059669' : '#92400e', border: `1px solid ${isCompleted ? '#a7f3d0' : '#fde68a'}` }}>
                  {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
                </span>
                {(dsStatus?.lastSignerDate || redemption.docuSignCompletedAt) && (
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
                    Completed: {new Date(dsStatus?.lastSignerDate ?? redemption.docuSignCompletedAt!).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {redemption.docuSignSentAt && (
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                    Sent: {new Date(redemption.docuSignSentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {dsStatus && <span style={{ fontSize: 10, color: '#94a3b8', alignSelf: 'center' }}>Live</span>}
              </div>
            )}

            {(dsStatus?.recipients || dbSigners) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {(dsStatus?.recipients
                  ? dsStatus.recipients.map(r => ({ name: r.name, email: r.email, roleName: r.roleName, status: r.status, signedAt: r.signedAt, sentAt: r.sentAt }))
                  : (dbSigners as Array<{ name: string; email: string; roleName: string; status: string; signedDateTime?: string; sentDateTime?: string }>)
                      .map(s => ({ name: s.name, email: s.email, roleName: s.roleName, status: s.status, signedAt: s.signedDateTime, sentAt: s.sentDateTime }))
                ).map((r, i) => {
                  const signed = r.status === 'completed' || r.status === 'signed';
                  const color = signed ? '#10b981' : r.status === 'declined' ? '#ef4444' : '#f59e0b';
                  return (
                    <div key={i} style={{ padding: '12px 14px', border: `1.5px solid ${color}33`, borderRadius: 10, background: signed ? '#f0fdf4' : '#fffbeb' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#0f2342', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {roleMap[r.roleName] ?? r.roleName}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{r.name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{r.email}</div>
                      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color }}>
                        {signed && r.signedAt
                          ? `Signed ${new Date(r.signedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                          : r.sentAt
                            ? `Sent ${new Date(r.sentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                            : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </div>
                      {!signed && (
                        <a href={`mailto:${r.email}`}
                          style={{ display: 'inline-block', marginTop: 8, padding: '4px 10px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#92400e', textDecoration: 'none' }}>
                          Send reminder
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
