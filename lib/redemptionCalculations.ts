// Ported from dpeg-onboarding/src/features/redemption/utils/calculations.ts
// Keep in sync with that file — both must compute identical redemption numbers.

export const PRICE_PER_UNIT = 50000;
export const ANNUAL_INTEREST_RATE = 0.08;
export const LONG_TERM_RATE = 0.10;
export const LONG_TERM_LOCK_YEARS = 6;
export const EARLY_EXIT_RATE = 0.08;

export interface RedemptionCalcInput {
  totalUnitsOwned: string;
  unitsToRedeem: string;
  originalPurchaseDate: string;
  effectiveDate: string;
  investmentTypeName: string;
}

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

function daysBetweenInclusive(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}

function calculateShortTermInterest(
  investmentDate: Date,
  redemptionDate: Date,
  capital: number,
  annualRate: number
): { interest: number; days: number } {
  const monthStart = new Date(redemptionDate.getFullYear(), redemptionDate.getMonth(), 1);
  const startDate = investmentDate > monthStart ? investmentDate : monthStart;
  const endDate = new Date(redemptionDate);
  endDate.setDate(endDate.getDate() - 1);
  if (endDate < startDate) return { interest: 0, days: 0 };
  const days = daysBetweenInclusive(startDate, endDate);
  const interest = (capital * annualRate / 365) * days;
  return { interest, days };
}

function calculateLongTermInterest(
  investmentDate: Date,
  redemptionDate: Date,
  capital: number,
  annualRate: number
): { interest: number; days: number } {
  const startDate = new Date(investmentDate);
  const endDate = new Date(redemptionDate);
  endDate.setDate(endDate.getDate() - 1);
  if (endDate < startDate) return { interest: 0, days: 0 };
  const days = daysBetweenInclusive(startDate, endDate);
  const interest = (capital * annualRate / 365) * days;
  return { interest, days };
}

export function calculateRedemption(formData: RedemptionCalcInput): RedemptionCalculations {
  const totalUnits = parseInt(formData.totalUnitsOwned) || 0;
  const redeemUnits = parseInt(formData.unitsToRedeem) || 0;
  const originalPurchasePrice = redeemUnits * PRICE_PER_UNIT;

  const isShortTerm = formData.investmentTypeName?.toLowerCase().includes('short') ?? false;

  let daysInvested = 0;
  let monthsInvested = 0;
  let proratedPreferredReturn = 0;
  let isEarlyExit = false;
  let completedMonthsDistributed = 0;
  let distributionClawback = 0;

  if (formData.originalPurchaseDate && formData.effectiveDate && redeemUnits > 0) {
    const investmentDate = new Date(formData.originalPurchaseDate + 'T00:00:00');
    const redemptionDate = new Date(formData.effectiveDate + 'T00:00:00');

    monthsInvested = Math.max(
      0,
      (redemptionDate.getFullYear() - investmentDate.getFullYear()) * 12 +
        (redemptionDate.getMonth() - investmentDate.getMonth())
    );

    if (isShortTerm) {
      const result = calculateShortTermInterest(investmentDate, redemptionDate, originalPurchasePrice, ANNUAL_INTEREST_RATE);
      proratedPreferredReturn = result.interest;
      daysInvested = result.days;
    } else {
      const yearsHeld = monthsInvested / 12;
      isEarlyExit = yearsHeld < LONG_TERM_LOCK_YEARS;

      if (isEarlyExit) {
        const totalResult = calculateLongTermInterest(investmentDate, redemptionDate, originalPurchasePrice, LONG_TERM_RATE);
        proratedPreferredReturn = totalResult.interest;
        daysInvested = totalResult.days;

        const excessRate = LONG_TERM_RATE - EARLY_EXIT_RATE;
        const clawbackResult = calculateLongTermInterest(investmentDate, redemptionDate, originalPurchasePrice, excessRate);
        distributionClawback = clawbackResult.interest;
        completedMonthsDistributed = Math.max(0, monthsInvested);
      } else {
        const result = calculateShortTermInterest(investmentDate, redemptionDate, originalPurchasePrice, LONG_TERM_RATE);
        proratedPreferredReturn = result.interest;
        daysInvested = result.days;
      }
    }
  }

  const yearsInvested = monthsInvested / 12;
  const returnPerUnit = redeemUnits > 0 ? proratedPreferredReturn / redeemUnits : 0;
  const aggregatePurchasePrice = originalPurchasePrice + proratedPreferredReturn;
  const netAggregatePrice = Math.max(0, aggregatePurchasePrice - distributionClawback);

  const round = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;

  return {
    totalUnits,
    redeemUnits,
    originalPurchasePrice: round(originalPurchasePrice),
    daysInvested,
    monthsInvested,
    yearsInvested: round(yearsInvested),
    isShortTerm,
    returnPerUnit: round(returnPerUnit),
    proratedPreferredReturn: round(proratedPreferredReturn),
    aggregatePurchasePrice: round(aggregatePurchasePrice),
    isEarlyExit,
    completedMonthsDistributed,
    distributionClawback: round(distributionClawback),
    netAggregatePrice: round(netAggregatePrice),
  };
}
