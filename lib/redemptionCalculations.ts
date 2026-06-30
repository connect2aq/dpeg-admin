// The redemption math (prorated return, early-exit clawback, net amount) is computed
// server-side by IRedemptionCalculationService — see GET /admin/redemption-preview.
// This file only keeps the response shape and a display formatter.

export interface RedemptionCalculations {
  totalUnits: number;
  redeemUnits: number;
  originalPurchasePrice: number;
  daysInvested: number;
  monthsInvested: number;
  yearsInvested: number;
  isShortTerm: boolean;
  returnPerUnit: number;
  proratedPreferredReturn: number;
  aggregatePurchasePrice: number;
  isEarlyExit: boolean;
  completedMonthsDistributed: number;
  distributionClawback: number;
  netAggregatePrice: number;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}
