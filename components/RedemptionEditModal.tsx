'use client';
import { useEffect, useState } from 'react';
import { adminApi, type CreateRedemptionAdminRequest } from '@/lib/api';

const INVESTOR_TYPES = ['Individual', 'Entity', 'IRA', 'Trust'];
const APP_STATUSES = ['Active', 'UnderReview', 'Rejected'];

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

export function RedemptionEditModal({ redemptionId, isSuperAdmin, onClose, onSaved }: {
  redemptionId: number;
  isSuperAdmin: boolean;
  onClose: () => void;
  onSaved: (pendingSubmitted: boolean, message: string) => void;
}) {
  const [form, setForm] = useState<CreateRedemptionAdminRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    adminApi.redemption(redemptionId).then(r => {
      if (!r.success || !r.data) { setMsg('Failed to load redemption.'); setLoading(false); return; }
      const d = r.data;
      setForm({
        trancheApplicationId: d.trancheApplicationId ?? undefined,
        sellingPartnerName: d.sellingPartnerName || '',
        investorType: d.investorType || 'Individual',
        entityName: d.entityName || '',
        signatoryName: d.signatoryName || '',
        signatoryTitle: d.signatoryTitle || '',
        totalUnitsOwned: d.totalUnitsOwned || '',
        unitsToRedeem: d.unitsToRedeem || '',
        originalPurchaseDate: d.originalPurchaseDate || '',
        aggregatePurchasePrice: d.aggregatePurchasePrice || '',
        proratedPreferredReturn: d.proratedPreferredReturn || '',
        effectiveDate: d.effectiveDate || '',
        printedName: d.printedName || '',
        addressLine1: d.addressLine1 || '',
        addressLine2: d.addressLine2 || '',
        addressLine3: d.addressLine3 || '',
        email: d.email || '',
        status: d.status || 'Active',
      });
      setLoading(false);
    });
  }, [redemptionId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSubmitting(true);
    setMsg('');
    const r = await adminApi.updateRedemptionFull(redemptionId, form);
    if (r.success) {
      onSaved(!isSuperAdmin, r.message || 'Saved.');
      onClose();
    } else {
      setMsg(r.message || 'Failed to update redemption.');
    }
    setSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '40px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'white', borderRadius: 12, width: 680, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f2342', margin: 0 }}>Edit Redemption</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {loading || !form ? (
            <div style={{ padding: 20, color: msg ? '#b91c1c' : '#64748b' }}>{msg || 'Loading...'}</div>
          ) : (
            <form onSubmit={submit}>
              {form.trancheApplicationId && (
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
                  Linked to Investment #{form.trancheApplicationId} (link not editable from this page — use the investor&apos;s user page to change)
                </div>
              )}

              <SectionTitle>Redemption Details</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <FormField label="Investor Type *">
                  <select required style={selectStyle} value={form.investorType} onChange={e => setForm(f => f && ({ ...f, investorType: e.target.value }))}>
                    {INVESTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </FormField>
                <FormField label="Status">
                  <select style={selectStyle} value={form.status || 'Active'} onChange={e => setForm(f => f && ({ ...f, status: e.target.value }))}>
                    {APP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </FormField>
                <FormField label="Selling Partner Name"><input style={inputStyle} value={form.sellingPartnerName || ''} onChange={e => setForm(f => f && ({ ...f, sellingPartnerName: e.target.value }))} /></FormField>
                <FormField label="Printed Name / Signature"><input style={inputStyle} value={form.printedName || ''} onChange={e => setForm(f => f && ({ ...f, printedName: e.target.value }))} /></FormField>
                <FormField label="Total Units Owned"><input style={inputStyle} value={form.totalUnitsOwned || ''} onChange={e => setForm(f => f && ({ ...f, totalUnitsOwned: e.target.value }))} /></FormField>
                <FormField label="Units to Redeem"><input style={inputStyle} value={form.unitsToRedeem || ''} onChange={e => setForm(f => f && ({ ...f, unitsToRedeem: e.target.value }))} /></FormField>
                <FormField label="Original Purchase Date"><input style={inputStyle} value={form.originalPurchaseDate || ''} onChange={e => setForm(f => f && ({ ...f, originalPurchaseDate: e.target.value }))} /></FormField>
                <FormField label="Effective Date"><input style={inputStyle} value={form.effectiveDate || ''} onChange={e => setForm(f => f && ({ ...f, effectiveDate: e.target.value }))} /></FormField>
                <FormField label="Aggregate Purchase Price ($)"><input style={inputStyle} value={form.aggregatePurchasePrice || ''} onChange={e => setForm(f => f && ({ ...f, aggregatePurchasePrice: e.target.value }))} /></FormField>
                <FormField label="Prorated Preferred Return ($)"><input style={inputStyle} value={form.proratedPreferredReturn || ''} onChange={e => setForm(f => f && ({ ...f, proratedPreferredReturn: e.target.value }))} /></FormField>
                <FormField label="Email"><input type="email" style={inputStyle} value={form.email || ''} onChange={e => setForm(f => f && ({ ...f, email: e.target.value }))} /></FormField>
              </div>

              {form.investorType !== 'Individual' && (
                <>
                  <SectionTitle>Entity / Signatory</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <FormField label="Entity Name"><input style={inputStyle} value={form.entityName || ''} onChange={e => setForm(f => f && ({ ...f, entityName: e.target.value }))} /></FormField>
                    <FormField label="Signatory Name"><input style={inputStyle} value={form.signatoryName || ''} onChange={e => setForm(f => f && ({ ...f, signatoryName: e.target.value }))} /></FormField>
                    <FormField label="Signatory Title"><input style={inputStyle} value={form.signatoryTitle || ''} onChange={e => setForm(f => f && ({ ...f, signatoryTitle: e.target.value }))} /></FormField>
                  </div>
                </>
              )}

              <SectionTitle>Address</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 16 }}>
                <FormField label="Address Line 1"><input style={inputStyle} value={form.addressLine1 || ''} onChange={e => setForm(f => f && ({ ...f, addressLine1: e.target.value }))} /></FormField>
                <FormField label="Address Line 2"><input style={inputStyle} value={form.addressLine2 || ''} onChange={e => setForm(f => f && ({ ...f, addressLine2: e.target.value }))} /></FormField>
                <FormField label="Address Line 3"><input style={inputStyle} value={form.addressLine3 || ''} onChange={e => setForm(f => f && ({ ...f, addressLine3: e.target.value }))} /></FormField>
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
