'use client';
import { useEffect, useState } from 'react';
import { adminApi, type ApplicationDetail, type CreateRedemptionAdminRequest } from '@/lib/api';
import { type RedemptionCalculations } from '@/lib/redemptionCalculations';
import { BankDetailsPanel, RedemptionSummaryPanel } from '@/components/RedemptionSummaryPanels';

const EMPTY_CALC: RedemptionCalculations = {
  totalUnits: 0, redeemUnits: 0, originalPurchasePrice: 0, daysInvested: 0, monthsInvested: 0,
  yearsInvested: 0, isShortTerm: false, returnPerUnit: 0, proratedPreferredReturn: 0,
  aggregatePurchasePrice: 0, isEarlyExit: false, completedMonthsDistributed: 0,
  distributionClawback: 0, netAggregatePrice: 0,
};

const inputStyle = { width: '100%', padding: '8px 11px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' as const };
const labelStyle = { fontSize: 11, fontWeight: 700 as const, color: '#475569', display: 'block' as const, marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: '0.04em' };
const readOnlyBoxStyle = { ...inputStyle, background: '#f8fafc', color: '#475569' };

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
  const [trancheDetail, setTrancheDetail] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    adminApi.redemption(redemptionId).then(async r => {
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
      if (d.trancheApplicationId) {
        const ar = await adminApi.application(d.trancheApplicationId);
        if (ar.success) setTrancheDetail(ar.data);
      }
      setLoading(false);
    });
  }, [redemptionId]);

  const [calc, setCalc] = useState<RedemptionCalculations>(EMPTY_CALC);

  useEffect(() => {
    const trancheId = form?.trancheApplicationId;
    const units = parseInt(form?.unitsToRedeem || '0') || 0;
    if (!trancheId || units <= 0 || !form?.effectiveDate) {
      setCalc(EMPTY_CALC);
      return;
    }
    const timer = setTimeout(() => {
      adminApi.getRedemptionPreview(trancheId, units, form.effectiveDate!)
        .then(r => setCalc(r.success && r.data ? r.data : EMPTY_CALC))
        .catch(() => setCalc(EMPTY_CALC));
    }, 350);
    return () => clearTimeout(timer);
  }, [form?.trancheApplicationId, form?.unitsToRedeem, form?.effectiveDate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSubmitting(true);
    setMsg('');
    // Server recomputes aggregatePurchasePrice/proratedPreferredReturn/distributionClawback/netAggregatePrice
    // from the linked tranche before saving — the previewed figures here are display-only.
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Investor Type</label>
                  <div style={readOnlyBoxStyle}>{form.investorType || '—'}</div>
                </div>
                <div>
                  <label style={labelStyle}>Total Units Owned</label>
                  <div style={readOnlyBoxStyle}>{form.totalUnitsOwned || '—'}</div>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <div style={readOnlyBoxStyle}>{form.status || 'Active'}</div>
                </div>
              </div>

              <SectionTitle>Bank Details</SectionTitle>
              <BankDetailsPanel
                bankName={trancheDetail?.investment?.bankName}
                accHolder={trancheDetail?.investment?.accHolder}
                accNumber={trancheDetail?.investment?.accNumber}
                routingNumber={trancheDetail?.investment?.routingNumber}
              />

              <SectionTitle>Redemption Details</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <FormField label="Units to Redeem *">
                  <input
                    required
                    type="number"
                    min={1}
                    max={trancheDetail?.investment?.numUnits ?? undefined}
                    style={inputStyle}
                    value={form.unitsToRedeem || ''}
                    onChange={e => setForm(f => f && ({ ...f, unitsToRedeem: e.target.value }))}
                  />
                </FormField>
                <FormField label="Effective Date *">
                  <input
                    required
                    type="date"
                    style={inputStyle}
                    value={form.effectiveDate || ''}
                    onChange={e => setForm(f => f && ({ ...f, effectiveDate: e.target.value }))}
                  />
                </FormField>
              </div>

              <SectionTitle>Redemption Summary</SectionTitle>
              <RedemptionSummaryPanel calc={calc} />

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
