'use client';
import { useEffect, useState } from 'react';
import { adminApi, type CreateApplicationRequest } from '@/lib/api';
import { BankAccountPicker } from './BankAccountPicker';

const INVESTOR_TYPES = ['Individual', 'Entity', 'IRA', 'Trust'];
const INVESTMENT_TYPES = ['ShortTerm', 'LongTerm'];
const ENTITY_SUB_TYPES = ['LLC', 'Corporation', 'LP_GP', 'PensionFund', 'BankBroker', 'Other'];
const PAYMENT_METHODS = ['WireTransfer', 'CertifiedCheck'];
const DIST_PREFS = ['WireToBank', 'Reinvest'];
const MARITAL_STATUSES = ['single', 'married', 'widowed', 'divorced'];

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
  const [ssNumberMasked, setSsNumberMasked] = useState('');
  const [spouseSSNMasked, setSpouseSSNMasked] = useState('');
  const [dlNoMasked, setDlNoMasked] = useState('');
  const [einMasked, setEinMasked] = useState('');
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
      setSsNumberMasked(p?.ssNumberMasked || '');
      setSpouseSSNMasked(p?.spouseSSN || '');
      setDlNoMasked(p?.drivingLicenseNo || '');
      setEinMasked(p?.ein || '');
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSubmitting(true);
    setMsg('');
    const r = await adminApi.updateApplicationFull(applicationId, form);
    if (r.success) {
      onSaved(!isSuperAdmin, r.message || 'Saved.');
      onClose();
    } else {
      setMsg(r.message || 'Failed to update investment.');
    }
    setSubmitting(false);
  };

  const isIndividual = form?.investorType === 'Individual';
  const isMarried = form?.maritalStatus?.toLowerCase() === 'married';
  const isIRA = form?.investorType === 'IRA';
  const hasCustodian = !!(form?.custodianName || isIRA);

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

              {/* ── Investor Information ── */}
              <SectionTitle>Investor Information</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <FormField label="First Name *"><input required style={inputStyle} value={form.firstName} onChange={e => setForm(f => f && ({ ...f, firstName: e.target.value }))} /></FormField>
                <FormField label="Last Name *"><input required style={inputStyle} value={form.lastName} onChange={e => setForm(f => f && ({ ...f, lastName: e.target.value }))} /></FormField>
                <FormField label="Phone"><input style={inputStyle} value={form.phone || ''} onChange={e => setForm(f => f && ({ ...f, phone: e.target.value }))} /></FormField>
                <FormField label="Day Phone"><input style={inputStyle} value={form.dayPhone || ''} onChange={e => setForm(f => f && ({ ...f, dayPhone: e.target.value }))} /></FormField>
                <FormField label="Night Phone"><input style={inputStyle} value={form.nightPhone || ''} onChange={e => setForm(f => f && ({ ...f, nightPhone: e.target.value }))} /></FormField>
                <FormField label="Date of Birth"><input type="date" style={inputStyle} value={form.dateOfBirth || ''} onChange={e => setForm(f => f && ({ ...f, dateOfBirth: e.target.value }))} /></FormField>
                <FormField label="Street Address"><input style={inputStyle} value={form.streetAddress || ''} onChange={e => setForm(f => f && ({ ...f, streetAddress: e.target.value }))} /></FormField>
                <FormField label="City"><input style={inputStyle} value={form.city || ''} onChange={e => setForm(f => f && ({ ...f, city: e.target.value }))} /></FormField>
                <FormField label="State"><input style={inputStyle} value={form.state || ''} onChange={e => setForm(f => f && ({ ...f, state: e.target.value }))} /></FormField>
                <FormField label="Zip Code"><input style={inputStyle} value={form.zipCode || ''} onChange={e => setForm(f => f && ({ ...f, zipCode: e.target.value }))} /></FormField>
                <FormField label="Mailing Address"><input style={inputStyle} value={form.mailingAddress || ''} onChange={e => setForm(f => f && ({ ...f, mailingAddress: e.target.value }))} /></FormField>
                <FormField label="Citizenship"><input style={inputStyle} value={form.citizenship || ''} onChange={e => setForm(f => f && ({ ...f, citizenship: e.target.value }))} /></FormField>
                <FormField label="Employer"><input style={inputStyle} value={form.employer || ''} onChange={e => setForm(f => f && ({ ...f, employer: e.target.value }))} /></FormField>
                <FormField label="Marital Status">
                  <select style={selectStyle} value={form.maritalStatus || ''} onChange={e => setForm(f => f && ({ ...f, maritalStatus: e.target.value }))}>
                    <option value="">— Select —</option>
                    {MARITAL_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </FormField>
                <FormField label="Ownership Type"><input style={inputStyle} value={form.ownershipType || ''} onChange={e => setForm(f => f && ({ ...f, ownershipType: e.target.value }))} /></FormField>
                {isIndividual && (
                  <FormField label="SSN (leave blank to keep)">
                    <input
                      style={inputStyle}
                      value={form.ssNumber || ''}
                      placeholder={ssNumberMasked || 'Enter new SSN to update'}
                      onChange={e => setForm(f => f && ({ ...f, ssNumber: e.target.value }))}
                      autoComplete="off"
                    />
                  </FormField>
                )}
              </div>

              {/* ── Spouse / Joint Tenant ── (Individual + married) */}
              {isIndividual && isMarried && (
                <>
                  <SectionTitle>Spouse / Joint Tenant</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <FormField label="Spouse Full Name"><input style={inputStyle} value={form.spouseFullName || ''} onChange={e => setForm(f => f && ({ ...f, spouseFullName: e.target.value }))} /></FormField>
                    <FormField label="Spouse Email"><input type="email" style={inputStyle} value={form.spouseEmail || ''} onChange={e => setForm(f => f && ({ ...f, spouseEmail: e.target.value }))} /></FormField>
                    <FormField label="Spouse Date of Birth"><input type="date" style={inputStyle} value={form.spouseDateOfBirth || ''} onChange={e => setForm(f => f && ({ ...f, spouseDateOfBirth: e.target.value }))} /></FormField>
                    <FormField label="Spouse SSN (leave blank to keep)">
                      <input
                        style={inputStyle}
                        value={form.spouseSSN || ''}
                        placeholder={spouseSSNMasked || 'Enter new Spouse SSN to update'}
                        onChange={e => setForm(f => f && ({ ...f, spouseSSN: e.target.value }))}
                        autoComplete="off"
                      />
                    </FormField>
                  </div>
                </>
              )}

              {/* ── Entity Information ── */}
              {form.investorType !== 'Individual' && (
                <>
                  <SectionTitle>Entity Information</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <FormField label="Entity Name"><input style={inputStyle} value={form.entityName || ''} onChange={e => setForm(f => f && ({ ...f, entityName: e.target.value }))} /></FormField>
                    <FormField label="EIN (leave blank to keep)"><input style={inputStyle} value={form.ein || ''} placeholder={einMasked || 'Enter EIN to update'} onChange={e => setForm(f => f && ({ ...f, ein: e.target.value }))} autoComplete="off" /></FormField>
                    <FormField label="State of Formation"><input style={inputStyle} value={form.stateFormation || ''} onChange={e => setForm(f => f && ({ ...f, stateFormation: e.target.value }))} /></FormField>
                    <FormField label="Signatory Name"><input style={inputStyle} value={form.signatoryName || ''} onChange={e => setForm(f => f && ({ ...f, signatoryName: e.target.value }))} /></FormField>
                    <FormField label="Signatory Title"><input style={inputStyle} value={form.signatoryTitle || ''} onChange={e => setForm(f => f && ({ ...f, signatoryTitle: e.target.value }))} /></FormField>
                  </div>
                </>
              )}

              {/* ── Custodian ── (IRA or existing custodian data) */}
              {hasCustodian && (
                <>
                  <SectionTitle>Custodian</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <FormField label="Custodian Name"><input style={inputStyle} value={form.custodianName || ''} onChange={e => setForm(f => f && ({ ...f, custodianName: e.target.value }))} /></FormField>
                    <FormField label="Custodian Account"><input style={inputStyle} value={form.custodianAcct || ''} onChange={e => setForm(f => f && ({ ...f, custodianAcct: e.target.value }))} /></FormField>
                    <FormField label="Custodian Phone"><input style={inputStyle} value={form.custodianPhone || ''} onChange={e => setForm(f => f && ({ ...f, custodianPhone: e.target.value }))} /></FormField>
                    <FormField label="Custodian Email"><input type="email" style={inputStyle} value={form.custodianEmail || ''} onChange={e => setForm(f => f && ({ ...f, custodianEmail: e.target.value }))} /></FormField>
                  </div>
                </>
              )}

              {/* ── Sensitive IDs ── */}
              <SectionTitle>Identity Documents</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <FormField label="Driving License No (leave blank to keep)">
                  <input
                    style={inputStyle}
                    value={form.drivingLicenseNo || ''}
                    placeholder={dlNoMasked || 'Enter new DL number to update'}
                    onChange={e => setForm(f => f && ({ ...f, drivingLicenseNo: e.target.value }))}
                    autoComplete="off"
                  />
                </FormField>
                <FormField label="Driving License State">
                  <input style={inputStyle} value={form.drivingLicenseState || ''} onChange={e => setForm(f => f && ({ ...f, drivingLicenseState: e.target.value }))} />
                </FormField>
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
