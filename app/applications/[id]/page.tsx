'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { adminApi, STATIC_BASE, type ApplicationDetail, type DocuSignEnvelopeStatus } from '@/lib/api';

const STATUSES = ['UnderReview', 'Active', 'Rejected'];

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

function DocumentPreview({ label, number, state, path }: { label: string; number?: string | null; state?: string | null; path: string }) {
  const fileUrl = `${STATIC_BASE}${path.startsWith('/') ? path : '/' + path}`;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f2342' }}>{label}</div>
          {number && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>No: {number}{state ? ` · ${state}` : ''}</div>}
        </div>
        <a href={fileUrl} target="_blank" rel="noopener noreferrer"
          style={{ padding: '5px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#475569', textDecoration: 'none' }}>
          Open in new tab ↗
        </a>
      </div>
      {isImage ? (
        <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
          <img src={fileUrl} alt={label}
            style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'block' }} />
        </a>
      ) : (
        <iframe src={fileUrl} title={label}
          style={{ width: '100%', height: 400, border: '1px solid #e2e8f0', borderRadius: 8 }} />
      )}
    </div>
  );
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [note, setNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState('');
  const [editingDate, setEditingDate] = useState(false);
  const [newEffectiveDate, setNewEffectiveDate] = useState('');
  const [dateUpdating, setDateUpdating] = useState(false);
  const [dateMsg, setDateMsg] = useState('');
  const [editingSubmitted, setEditingSubmitted] = useState(false);
  const [newSubmittedAt, setNewSubmittedAt] = useState('');
  const [submittedUpdating, setSubmittedUpdating] = useState(false);
  const [submittedMsg, setSubmittedMsg] = useState('');
  const [dsStatus, setDsStatus] = useState<DocuSignEnvelopeStatus | null>(null);
  const [dsLoading, setDsLoading] = useState(false);
  const [dsError, setDsError] = useState('');
  const [dsSyncing, setDsSyncing] = useState(false);
  const [dsSyncMsg, setDsSyncMsg] = useState('');
  const [dsSending, setDsSending] = useState(false);
  const [dsSendMsg, setDsSendMsg] = useState('');

  useEffect(() => {
    adminApi.application(Number(id))
      .then(r => {
        if (r.success) {
          setApp(r.data);
          setNewStatus(r.data.status);
          setNewEffectiveDate(r.data.effectiveDate ? r.data.effectiveDate.substring(0, 10) : '');
          setNewSubmittedAt(r.data.submittedAt ? r.data.submittedAt.substring(0, 10) : '');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const saveEffectiveDate = async () => {
    if (!app || !newEffectiveDate) return;
    setDateUpdating(true);
    setDateMsg('');
    try {
      const r = await adminApi.updateApplicationEffectiveDate(app.id, newEffectiveDate);
      if (r.success) {
        setApp(a => a ? { ...a, effectiveDate: newEffectiveDate } : a);
        setDateMsg('Date updated.');
        setEditingDate(false);
      } else {
        setDateMsg(r.message || 'Failed to update.');
      }
    } catch {
      setDateMsg('Network error. Please try again.');
    } finally {
      setDateUpdating(false);
      setTimeout(() => setDateMsg(''), 4000);
    }
  };

  const saveSubmittedAt = async () => {
    if (!app || !newSubmittedAt) return;
    setSubmittedUpdating(true);
    setSubmittedMsg('');
    try {
      const r = await adminApi.updateApplicationSubmittedAt(app.id, newSubmittedAt);
      if (r.success) {
        setApp(a => a ? { ...a, submittedAt: newSubmittedAt } : a);
        setSubmittedMsg('Date updated.');
        setEditingSubmitted(false);
      } else {
        setSubmittedMsg(r.message || 'Failed to update.');
      }
    } catch {
      setSubmittedMsg('Network error. Please try again.');
    } finally {
      setSubmittedUpdating(false);
      setTimeout(() => setSubmittedMsg(''), 4000);
    }
  };

  const updateStatus = async () => {
    if (!app || newStatus === app.status) return;
    setUpdating(true);
    const r = await adminApi.updateApplicationStatus(app.id, newStatus, note);
    setMsg(r.success ? 'Status updated.' : r.message);
    if (r.success) setApp(a => a ? { ...a, status: newStatus } : a);
    setUpdating(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const loadDsStatus = async () => {
    if (!app?.docuSignEnvelopeId) return;
    setDsLoading(true); setDsError('');
    const r = await adminApi.docuSignEnvelopeStatus(app.docuSignEnvelopeId);
    if (r.success) setDsStatus(r.data);
    else setDsError(r.message || 'Failed to load');
    setDsLoading(false);
  };

  const sendDsEnvelope = async () => {
    if (!app) return;
    setDsSending(true); setDsSendMsg('');
    const r = await adminApi.sendDocuSignEnvelope(app.id);
    if (r.success) {
      setApp(a => a ? { ...a, docuSignStatus: 'sent', docuSignSentAt: new Date().toISOString() } : a);
      setDsSendMsg('Sent to signers.');
    } else {
      setDsSendMsg(r.message || 'Failed to send');
    }
    setDsSending(false);
    setTimeout(() => setDsSendMsg(''), 5000);
  };

  const syncDsDate = async () => {
    if (!app) return;
    setDsSyncing(true); setDsSyncMsg('');
    const r = await adminApi.syncDocuSignDate(app.id);
    if (r.success) {
      setApp(a => a ? { ...a, effectiveDate: r.data } : a);
      setNewEffectiveDate(r.data);
      setDsSyncMsg(`Effective date set to ${r.data}`);
    } else {
      setDsSyncMsg(r.message || 'Failed');
    }
    setDsSyncing(false);
    setTimeout(() => setDsSyncMsg(''), 6000);
  };

  if (loading) return <AdminLayout><div style={{ padding: 40, color: '#64748b' }}>Loading...</div></AdminLayout>;
  if (!app) return <AdminLayout><div style={{ padding: 40 }}><p style={{ color: '#ef4444' }}>Application not found.</p></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px', maxWidth: 960 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
          <Link href="/applications" style={{ color: '#b8923a', textDecoration: 'none' }}>Applications</Link> / #{app.id}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f2342' }}>
              Application #{app.id}
              {app.ppmRefNO && <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 400, marginLeft: 12 }}>PPM {app.ppmRefNO}</span>}
            </h1>
            <p style={{ color: '#64748b', marginTop: 4 }}>
              {app.userFirstName} {app.userLastName} · {app.userEmail}
            </p>
          </div>
          <StatusBadge status={app.status} />
        </div>

        {/* Status Update */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 16 }}>Review Decision</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
              style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Review note (optional)"
              style={{ flex: '1 1 250px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
            />
            <button className="btn-primary" onClick={updateStatus} disabled={updating || newStatus === app.status}>
              {updating ? 'Updating...' : 'Apply Decision'}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg.includes('updated') ? '#10b981' : '#ef4444', alignSelf: 'center' }}>{msg}</span>}
          </div>
          {app.reviewNote && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#92400e' }}>Review Note — </span>
              <span style={{ fontSize: 13, color: '#78350f' }}>{app.reviewNote}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Application Summary */}
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 16 }}>Application Info</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <InfoRow label="Investor Type" value={app.investorType} />
              <InfoRow label="Investment Type" value={app.investmentType} />
              <InfoRow label="Entity Subtype" value={app.entitySubType} />
              <InfoRow label="Current Step" value={`${app.currentStep} / 7`} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 3 }}>
                  Submitted (Purchase Date)
                </div>
                {editingSubmitted ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <input
                      type="date"
                      value={newSubmittedAt}
                      onChange={e => setNewSubmittedAt(e.target.value)}
                      style={{ padding: '4px 8px', border: '1.5px solid #b8923a', borderRadius: 6, fontSize: 13, color: '#1a1a2e' }}
                    />
                    <button onClick={saveSubmittedAt} disabled={submittedUpdating}
                      style={{ padding: '4px 10px', background: '#b8923a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {submittedUpdating ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => { setEditingSubmitted(false); setNewSubmittedAt(app.submittedAt ? app.submittedAt.substring(0, 10) : ''); }}
                      style={{ padding: '4px 10px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    {submittedMsg && <span style={{ fontSize: 12, color: submittedMsg.includes('updated') ? '#10b981' : '#ef4444' }}>{submittedMsg}</span>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, color: '#1a1a2e', fontWeight: 500 }}>
                      {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : '—'}
                    </span>
                    <button onClick={() => setEditingSubmitted(true)}
                      style={{ padding: '2px 8px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>
                      Edit
                    </button>
                    {submittedMsg && <span style={{ fontSize: 12, color: '#10b981' }}>{submittedMsg}</span>}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 3 }}>
                  Effective Date
                </div>
                {editingDate ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <input
                      type="date"
                      value={newEffectiveDate}
                      onChange={e => setNewEffectiveDate(e.target.value)}
                      style={{ padding: '4px 8px', border: '1.5px solid #b8923a', borderRadius: 6, fontSize: 13, color: '#1a1a2e' }}
                    />
                    <button onClick={saveEffectiveDate} disabled={dateUpdating}
                      style={{ padding: '4px 10px', background: '#b8923a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {dateUpdating ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => { setEditingDate(false); setNewEffectiveDate(app.effectiveDate ? app.effectiveDate.substring(0, 10) : ''); }}
                      style={{ padding: '4px 10px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    {dateMsg && <span style={{ fontSize: 12, color: dateMsg.includes('updated') ? '#10b981' : '#ef4444' }}>{dateMsg}</span>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, color: '#1a1a2e', fontWeight: 500 }}>
                      {app.effectiveDate ? new Date(app.effectiveDate).toLocaleDateString() : '—'}
                    </span>
                    <button onClick={() => setEditingDate(true)}
                      style={{ padding: '2px 8px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>
                      Edit
                    </button>
                    {dateMsg && <span style={{ fontSize: 12, color: '#10b981' }}>{dateMsg}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Investment */}
          {app.investment && (
            <div className="card">
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 16 }}>Investment Details</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <InfoRow label="Units" value={String(app.investment.numUnits)} />
                <InfoRow label="Total Amount" value={app.investment.totalAmount ? `$${app.investment.totalAmount.toLocaleString()}` : undefined} />
                <InfoRow label="Payment Method" value={app.investment.paymentMethod} />
                <InfoRow label="Distribution" value={app.investment.distributionPreference} />
                <InfoRow label="Bank" value={app.investment.bankName} />
                <InfoRow label="Account Holder" value={app.investment.accHolder} />
              </div>
            </div>
          )}
        </div>

        {/* Investor Profile */}
        {app.investorProfile && (
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 4 }}>Investor Profile</h2>

            <SectionLabel>Identity</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <InfoRow label="Name" value={[app.investorProfile.firstName, app.investorProfile.lastName].filter(Boolean).join(' ')} />
              <InfoRow label="Date of Birth" value={app.investorProfile.dateOfBirth} />
              <InfoRow label="Citizenship" value={app.investorProfile.citizenship} />
              <InfoRow label="Marital Status" value={app.investorProfile.maritalStatus} />
              <InfoRow label="Ownership Type" value={app.investorProfile.ownershipType} />
            </div>

            <SectionLabel>Contact</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <InfoRow label="Email" value={app.investorProfile.email} />
              <InfoRow label="Phone" value={app.investorProfile.phone} />
              <InfoRow label="Day Phone" value={app.investorProfile.dayPhone} />
              <InfoRow label="Night Phone" value={app.investorProfile.nightPhone} />
              <InfoRow label="Employer" value={app.investorProfile.employer} />
              <InfoRow label="Address" value={app.investorProfile.addressLine1} />
              <InfoRow label="City / State" value={[app.investorProfile.city, app.investorProfile.state].filter(Boolean).join(', ')} />
              <InfoRow label="Zip" value={app.investorProfile.zipCode} />
              <InfoRow label="Mailing Address" value={app.investorProfile.mailingAddress} />
            </div>

            {app.investorProfile.spouseFullName && (
              <>
                <SectionLabel>Spouse</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  <InfoRow label="Spouse Name" value={app.investorProfile.spouseFullName} />
                  <InfoRow label="Spouse Email" value={app.investorProfile.spouseEmail} />
                  <InfoRow label="Spouse DOB" value={app.investorProfile.spouseDateOfBirth} />
                </div>
              </>
            )}

            {app.investorProfile.entityName && (
              <>
                <SectionLabel>Entity</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  <InfoRow label="Entity Name" value={app.investorProfile.entityName} />
                  <InfoRow label="EIN" value={app.investorProfile.ein} />
                  <InfoRow label="State of Formation" value={app.investorProfile.stateFormation} />
                  <InfoRow label="Signatory Name" value={app.investorProfile.signatoryName} />
                  <InfoRow label="Signatory Title" value={app.investorProfile.signatoryTitle} />
                </div>
              </>
            )}

            {app.investorProfile.custodianName && (
              <>
                <SectionLabel>Custodian</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  <InfoRow label="Custodian Name" value={app.investorProfile.custodianName} />
                  <InfoRow label="Account" value={app.investorProfile.custodianAcct} />
                  <InfoRow label="Phone" value={app.investorProfile.custodianPhone} />
                  <InfoRow label="Email" value={app.investorProfile.custodianEmail} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Identity Documents */}
        {app.investorProfile && (app.investorProfile.drivingLicensePath || app.investorProfile.taxCertificatePath) && (
          <div className="card" style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 16 }}>Identity Documents</h2>
            {app.investorProfile.drivingLicensePath && (
              <DocumentPreview
                label="Driving License"
                number={app.investorProfile.drivingLicenseNo}
                state={app.investorProfile.drivingLicenseState}
                path={app.investorProfile.drivingLicensePath}
              />
            )}
            {app.investorProfile.taxCertificatePath && (
              <DocumentPreview
                label="Tax Certificate / EIN Letter"
                number={app.investorProfile.taxCertificateNo}
                path={app.investorProfile.taxCertificatePath}
              />
            )}
          </div>
        )}

        {/* DocuSign Status */}
        {app.docuSignEnvelopeId && (() => {
          const dbSigners = (() => {
            try { return app.docuSignSignersJson ? JSON.parse(app.docuSignSignersJson) : null; } catch { return null; }
          })();
          const displayStatus = dsStatus ? dsStatus.envelopeStatus : app.docuSignStatus;
          const isCompleted = displayStatus === 'completed';
          const roleMap: Record<string, string> = { Signer: 'Investor', SpouseSigner: 'Spouse' };
          return (
            <div className="card" style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342' }}>DocuSign Agreement</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {(!app.docuSignStatus || app.docuSignStatus === 'created') &&
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
                  {dsStatus?.lastSignerDate && (
                    <button onClick={syncDsDate} disabled={dsSyncing}
                      style={{ padding: '6px 14px', background: '#0f2342', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#fff', cursor: dsSyncing ? 'default' : 'pointer', opacity: dsSyncing ? 0.7 : 1 }}>
                      {dsSyncing ? 'Setting…' : 'Set Effective Date from DocuSign'}
                    </button>
                  )}
                  {dsSyncMsg && (
                    <span style={{ fontSize: 12, color: dsSyncMsg.includes('set') || dsSyncMsg.includes('Set') ? '#10b981' : '#ef4444' }}>{dsSyncMsg}</span>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
                Envelope ID: <span style={{ fontFamily: 'monospace', color: '#475569' }}>{app.docuSignEnvelopeId}</span>
              </div>

              {dsError && <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 8 }}>{dsError}</div>}

              {displayStatus && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: isCompleted ? '#ecfdf5' : '#fffbeb', color: isCompleted ? '#059669' : '#92400e', border: `1px solid ${isCompleted ? '#a7f3d0' : '#fde68a'}` }}>
                    {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
                  </span>
                  {(dsStatus?.lastSignerDate || app.docuSignCompletedAt) && (
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
                      Completed: {new Date(dsStatus?.lastSignerDate ?? app.docuSignCompletedAt!).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {app.docuSignSentAt && (
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                      Sent: {new Date(app.docuSignSentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {dsStatus && <span style={{ fontSize: 10, color: '#94a3b8', alignSelf: 'center' }}>Live</span>}
                </div>
              )}

              {/* Signers — prefer live dsStatus recipients, fall back to DB signers JSON */}
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
          );
        })()}

        {/* User link */}
        {app.userId && (
          <div style={{ marginTop: 20 }}>
            <Link href={`/users/${app.userId}`} style={{ color: '#b8923a', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              ← View User Profile
            </Link>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
