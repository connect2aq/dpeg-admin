'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { adminApi, type ApplicationDetail } from '@/lib/api';

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

  useEffect(() => {
    adminApi.application(Number(id))
      .then(r => {
        if (r.success) {
          setApp(r.data);
          setNewStatus(r.data.status);
          setNewEffectiveDate(r.data.effectiveDate ? r.data.effectiveDate.substring(0, 10) : '');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const saveEffectiveDate = async () => {
    if (!app || !newEffectiveDate) return;
    setDateUpdating(true);
    const r = await adminApi.updateApplicationEffectiveDate(app.id, newEffectiveDate);
    if (r.success) {
      setApp(a => a ? { ...a, effectiveDate: newEffectiveDate } : a);
      setDateMsg('Date updated.');
      setEditingDate(false);
    } else {
      setDateMsg(r.message || 'Failed to update.');
    }
    setDateUpdating(false);
    setTimeout(() => setDateMsg(''), 3000);
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
              <InfoRow label="Submitted" value={app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : undefined} />
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
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 16 }}>Investor Profile</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <InfoRow label="Name" value={[app.investorProfile.firstName, app.investorProfile.lastName].filter(Boolean).join(' ')} />
              <InfoRow label="Email" value={app.investorProfile.email} />
              <InfoRow label="Phone" value={app.investorProfile.phone} />
              <InfoRow label="Address" value={app.investorProfile.addressLine1} />
              <InfoRow label="City / State" value={[app.investorProfile.city, app.investorProfile.state].filter(Boolean).join(', ')} />
              <InfoRow label="Zip" value={app.investorProfile.zipCode} />
              <InfoRow label="Citizenship" value={app.investorProfile.citizenship} />
              <InfoRow label="Marital Status" value={app.investorProfile.maritalStatus} />
              <InfoRow label="Entity Name" value={app.investorProfile.entityName} />
              <InfoRow label="EIN" value={app.investorProfile.ein} />
            </div>
          </div>
        )}

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
