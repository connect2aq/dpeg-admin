'use client';
import { useEffect, useState } from 'react';
import { adminApi, type CreateApplicationRequest, type InvestorEntityProfile } from '@/lib/api';
import { BankAccountPicker } from './BankAccountPicker';
import { AdminInvestorProfilePicker } from './AdminInvestorProfilePicker';

const INVESTOR_TYPES = ['Individual', 'Entity', 'IRA', 'Trust'];
const INVESTMENT_TYPES = ['ShortTerm', 'LongTerm'];
const ENTITY_SUB_TYPES = ['LLC', 'Corporation', 'LP_GP', 'PensionFund', 'BankBroker', 'Other'];
const PAYMENT_METHODS = ['WireTransfer', 'CertifiedCheck'];
const DIST_PREFS = ['WireToBank', 'Reinvest'];

const inputStyle = { width: '100%', padding: '8px 11px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' as const };
const labelStyle = { fontSize: 11, fontWeight: 700 as const, color: '#475569', display: 'block' as const, marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: '0.04em' };
const selectStyle = { ...inputStyle, background: 'white' };

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#0f2342', borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 12, marginTop: 8 }}>
      {children}
    </div>
  );
}

export function InvestmentEditModal({ applicationId, isSuperAdmin, onClose, onSaved }: {
  applicationId: number;
  isSuperAdmin: boolean;
  onClose: () => void;
  onSaved: (pendingSubmitted: boolean, message: string) => void;
}) {
  const [form, setForm] = useState<CreateApplicationRequest | null>(null);
  const [investorUserId, setInvestorUserId] = useState<number | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    adminApi.application(applicationId).then(r => {
      if (!r.success || !r.data) { setMsg('Failed to load investment.'); setLoading(false); return; }
      const d = r.data;
      const p = d.investorProfile;
      const inv = d.investment;
      setInvestorUserId(d.userId ?? null);
      setSelectedProfileId(d.investorEntityProfileId ?? null);
      setForm({
        investorType: d.investorType || 'Individual',
        investmentType: d.investmentType || '',
        entitySubType: d.entitySubType || '',
        effectiveDate: d.effectiveDate ? d.effectiveDate.split('T')[0] : '',
        submittedAt: d.submittedAt ? d.submittedAt.split('T')[0] : '',
        firstName: p?.firstName || '',
        lastName: p?.lastName || '',
        phone: p?.phone || '',
        dateOfBirth: p?.dateOfBirth || '',
        streetAddress: p?.addressLine1 || '',
        city: p?.city || '',
        state: p?.state || '',
        zipCode: p?.zipCode || '',
        citizenship: p?.citizenship || '',
        employer: p?.employer || '',
        maritalStatus: p?.maritalStatus || '',
        ownershipType: p?.ownershipType || '',
        mailingAddress: p?.mailingAddress || '',
        dayPhone: p?.dayPhone || '',
        nightPhone: p?.nightPhone || '',
        spouseFullName: p?.spouseFullName || '',
        spouseEmail: p?.spouseEmail || '',
        spouseDateOfBirth: p?.spouseDateOfBirth || '',
        custodianName: p?.custodianName || '',
        custodianAcct: p?.custodianAcct || '',
        custodianPhone: p?.custodianPhone || '',
        custodianEmail: p?.custodianEmail || '',
        drivingLicenseState: p?.drivingLicenseState || '',
        entityName: p?.entityName || '',
        stateFormation: p?.stateFormation || '',
        signatoryName: p?.signatoryName || '',
        signatoryTitle: p?.signatoryTitle || '',
        numUnits: inv?.numUnits || 0,
        totalAmount: inv?.totalAmount || 0,
        ppmRefNO: inv?.ppmRefNO ?? undefined,
        paymentMethod: inv?.paymentMethod || 'WireTransfer',
        distributionPreference: inv?.distributionPreference || 'WireToBank',
        bankAccountId: inv?.bankAccountId ?? null,
      });
      setLoading(false);
    });
  }, [applicationId]);

  // Pulls the picked investor profile's fields into the form so submitting keeps this
  // application's own snapshot in sync with whichever identity it's now filed under.
  // Sensitive fields (SSN/EIN/driving license) are masked in the profile the picker sees,
  // so they're deliberately left blank here -- blank means "leave unchanged" on save,
  // same convention as everywhere else in this modal.
  const handleSelectProfile = (profileId: number, profile: InvestorEntityProfile) => {
    setSelectedProfileId(profileId);
    setForm(f => f && ({
      ...f,
      investorType: profile.investorType,
      entitySubType: profile.entitySubType || '',
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      phone: profile.phone || '',
      dateOfBirth: profile.dateOfBirth || '',
      streetAddress: profile.streetAddress || '',
      city: profile.city || '',
      state: profile.state || '',
      zipCode: profile.zipCode || '',
      citizenship: profile.citizenship || '',
      employer: profile.employer || '',
      maritalStatus: profile.maritalStatus || '',
      ownershipType: profile.ownershipType || '',
      mailingAddress: profile.mailingAddress || '',
      dayPhone: profile.day || '',
      nightPhone: profile.night || '',
      spouseFullName: profile.spouseFullName || '',
      spouseEmail: profile.spouseEmail || '',
      spouseDateOfBirth: profile.spouseDateOfBirth || '',
      custodianName: profile.custodianName || '',
      custodianAcct: profile.custodianAcct || '',
      custodianPhone: profile.custodianPhone || '',
      custodianEmail: profile.custodianEmail || '',
      entityName: profile.entityName || '',
      stateFormation: profile.stateFormation || '',
      signatoryName: profile.signatoryName || '',
      signatoryTitle: profile.signatoryTitle || '',
      drivingLicenseState: profile.drivingLicenseState || '',
      ssNumber: '',
      spouseSSN: '',
      ein: '',
      drivingLicenseNo: '',
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSubmitting(true);
    setMsg('');
    const r = await adminApi.updateApplicationFull(applicationId, { ...form, investorEntityProfileId: selectedProfileId });
    if (r.success) {
      onSaved(!isSuperAdmin, r.message || 'Saved.');
      onClose();
    } else {
      setMsg(r.message || 'Failed to update investment.');
    }
    setSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '40px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'white', borderRadius: 12, width: 720, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f2342', margin: 0 }}>Edit Investment</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {loading || !form ? (
            <div style={{ padding: 20, color: msg ? '#b91c1c' : '#64748b' }}>{msg || 'Loading...'}</div>
          ) : (
            <form onSubmit={submit}>
              {/* ── Application ── */}
              <SectionTitle>Application</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <FormField label="Investor Type *">
                  <select required style={selectStyle} value={form.investorType} onChange={e => setForm(f => f && ({ ...f, investorType: e.target.value }))}>
                    {INVESTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </FormField>
                <FormField label="Investment Type">
                  <select style={selectStyle} value={form.investmentType || ''} onChange={e => setForm(f => f && ({ ...f, investmentType: e.target.value }))}>
                    <option value="">— Select —</option>
                    {INVESTMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </FormField>
                {form.investorType !== 'Individual' && (
                  <FormField label="Entity Sub-Type">
                    <select style={selectStyle} value={form.entitySubType || ''} onChange={e => setForm(f => f && ({ ...f, entitySubType: e.target.value }))}>
                      <option value="">— Select —</option>
                      {ENTITY_SUB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </FormField>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <FormField label="Effective Date">
                  <input type="date" style={inputStyle} value={form.effectiveDate || ''} onChange={e => setForm(f => f && ({ ...f, effectiveDate: e.target.value }))} />
                </FormField>
                <FormField label="Submitted / Purchase Date">
                  <input type="date" style={inputStyle} value={form.submittedAt || ''} onChange={e => setForm(f => f && ({ ...f, submittedAt: e.target.value }))} />
                </FormField>
              </div>

              {/* ── Investor Profile ── */}
              <SectionTitle>Investor Profile</SectionTitle>
              <div style={{ marginBottom: 16 }}>
                {investorUserId ? (
                  <AdminInvestorProfilePicker
                    userId={investorUserId}
                    isSuperAdmin={isSuperAdmin}
                    selectedId={selectedProfileId}
                    onSelect={handleSelectProfile}
                  />
                ) : (
                  <p style={{ fontSize: 13, color: '#94a3b8' }}>Unable to load this investor&apos;s profiles.</p>
                )}
              </div>

              {/* ── Investment Details ── */}
              <SectionTitle>Investment Details</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <FormField label="Units *"><input required type="number" min={1} style={inputStyle} value={form.numUnits || ''} onChange={e => setForm(f => f && ({ ...f, numUnits: Number(e.target.value) }))} /></FormField>
                <FormField label="Total Amount ($) *"><input required type="number" min={0} step="0.01" style={inputStyle} value={form.totalAmount || ''} onChange={e => setForm(f => f && ({ ...f, totalAmount: Number(e.target.value) }))} /></FormField>
                <FormField label="PPM Ref# (auto if blank)"><input type="number" style={inputStyle} value={form.ppmRefNO ?? ''} onChange={e => setForm(f => f && ({ ...f, ppmRefNO: e.target.value ? Number(e.target.value) : undefined }))} /></FormField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <FormField label="Payment Method">
                  <select style={selectStyle} value={form.paymentMethod || ''} onChange={e => setForm(f => f && ({ ...f, paymentMethod: e.target.value }))}>
                    <option value="">— Select —</option>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </FormField>
                <FormField label="Distribution Preference">
                  <select style={selectStyle} value={form.distributionPreference || ''} onChange={e => setForm(f => f && ({ ...f, distributionPreference: e.target.value }))}>
                    <option value="">— Select —</option>
                    {DIST_PREFS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </FormField>
              </div>

              {/* ── Bank Details ── */}
              <SectionTitle>Bank Details</SectionTitle>
              <div style={{ marginBottom: 16 }}>
                {investorUserId ? (
                  <BankAccountPicker
                    userId={investorUserId}
                    isSuperAdmin={isSuperAdmin}
                    selectedId={form.bankAccountId ?? null}
                    onSelect={id => setForm(f => f && ({ ...f, bankAccountId: id }))}
                  />
                ) : (
                  <p style={{ fontSize: 13, color: '#94a3b8' }}>Unable to load this investor&apos;s bank accounts.</p>
                )}
              </div>

              {msg && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{msg}</p>}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
                <button type="submit" disabled={submitting} style={{ padding: '10px 22px', background: '#0f2342', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? 'Saving...' : isSuperAdmin ? 'Save Changes' : 'Submit Change for Approval'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
