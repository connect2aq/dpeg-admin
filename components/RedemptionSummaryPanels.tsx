'use client';
import { formatCurrency, type RedemptionCalculations } from '@/lib/redemptionCalculations';

const infoLabelStyle = { fontSize: 11, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 3 };
const infoValueStyle = { fontSize: 14, color: '#1a1a2e', fontWeight: 500 as const };

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

export function RedemptionSummaryPanel({ calc }: { calc: RedemptionCalculations }) {
  if (calc.redeemUnits <= 0) {
    return <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>Enter units to redeem to see the calculated summary.</p>;
  }
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
        <InfoRow label="Redeemed Units" value={`${calc.redeemUnits} of ${calc.totalUnits}`} />
        <InfoRow label="Interest Period" value={`${calc.daysInvested} day${calc.daysInvested !== 1 ? 's' : ''}`} />
        <InfoRow label="Original Purchase Price" value={formatCurrency(calc.originalPurchasePrice)} />
        <InfoRow label="Prorated Preferred Return" value={formatCurrency(calc.proratedPreferredReturn)} />
        {calc.isEarlyExit && <InfoRow label="Distribution Clawback" value={'-' + formatCurrency(calc.distributionClawback)} />}
      </div>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f2342', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Aggregate Purchase Price</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#0f2342' }}>{formatCurrency(calc.aggregatePurchasePrice)}</span>
      </div>
      {calc.isEarlyExit && (
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c' }}>Net Amount Returned (early exit)</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#b91c1c' }}>{formatCurrency(calc.netAggregatePrice)}</span>
        </div>
      )}
    </div>
  );
}
