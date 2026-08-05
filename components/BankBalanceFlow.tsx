"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bankTransactionsApi, type BankTransactionBalanceFlow } from "@/lib/api";

const card = {
  background: "#fff",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "20px 24px",
  marginBottom: 20,
} as React.CSSProperties;

const btn = (color: string, disabled?: boolean): React.CSSProperties => ({
  padding: "8px 18px",
  borderRadius: 6,
  border: "none",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 13,
  fontWeight: 600,
  background: disabled ? "#d1d5db" : color,
  color: "#fff",
  opacity: disabled ? 0.7 : 1,
});

// Mirrors the old Dashboard "Balance Flow" card visually, but every number here is
// derived purely from categorized bank transactions rather than manually-entered
// figures — so "Bank Account Balance" is Calculated Balance (the anchored running
// total, not the bank's own reported Balance), and "Variance" against it catches
// both miscategorized/uncategorized activity AND transactions the admin forgot to
// import in the first place, since a missing transaction breaks the running total.

export function BankBalanceFlow({ onViewCategory }: { onViewCategory: (value: string | null) => void }) {
  const router = useRouter();
  const [data, setData] = useState<BankTransactionBalanceFlow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bankTransactionsApi.getBalanceFlow();
      if (res.success) setData(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fmt = (n: number) =>
    `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const signedFlow = (n: number) => `${n < 0 ? "−" : ""}${fmt(n)}`;

  const getCat = (name: string) =>
    data?.categoryTotals.find((c) => c.categoryName.toLowerCase() === name.toLowerCase());

  const boxStyle = (accent: string, muted?: boolean, clickable?: boolean): React.CSSProperties => ({
    background: muted ? "#f8fafc" : "#fff",
    border: `1px solid ${muted ? "#e2e8f0" : "#cbd5e1"}`,
    borderTop: `3px solid ${accent}`,
    borderRadius: 8,
    padding: "12px 14px",
    opacity: muted ? 0.65 : 1,
    cursor: clickable ? "pointer" : "default",
    transition: "box-shadow 0.15s",
    height: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    textAlign: "left",
  });

  const arrowStyle = (color: string, muted?: boolean, clickable?: boolean): React.CSSProperties => ({
    background: muted ? "#f8fafc" : `${color}0d`,
    border: `1px solid ${muted ? "#e2e8f0" : `${color}40`}`,
    borderTop: `3px solid ${muted ? "#e2e8f0" : color}`,
    borderRadius: 8,
    padding: "12px 14px",
    opacity: muted ? 0.65 : 1,
    cursor: clickable ? "pointer" : "default",
    transition: "box-shadow 0.15s",
    height: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    textAlign: "left",
  });

  const hoverHandlers = (clickable?: boolean) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (clickable) e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)";
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (clickable) e.currentTarget.style.boxShadow = "";
    },
  });

  const tile = (opts: {
    label: string;
    value: string;
    accent: string;
    arrow?: boolean;
    muted?: boolean;
    breakdown?: string;
    sub?: string;
    onClick?: () => void;
  }) => {
    const { label, value, accent, arrow, muted, breakdown, sub, onClick } = opts;
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        style={arrow ? arrowStyle(accent, muted, !!onClick) : boxStyle(accent, muted, !!onClick)}
        {...hoverHandlers(!!onClick)}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: muted ? "#94a3b8" : arrow ? accent : "#64748b",
            marginBottom: 6,
          }}
        >
          {arrow ? `→ ${label}` : label}
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: muted ? "#94a3b8" : arrow ? accent : "#0e3416",
            flex: 1,
          }}
        >
          {value}
        </div>
        {breakdown && (
          <div style={{ fontSize: 10, color: muted ? "#94a3b8" : arrow ? `${accent}cc` : "#64748b", marginTop: 4 }}>
            {breakdown}
          </div>
        )}
        {sub && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: breakdown ? 2 : 4 }}>{sub}</div>}
        {onClick && (
          <div style={{ fontSize: 10, color: "#699172", marginTop: 6, fontWeight: 600 }}>
            View details →
          </div>
        )}
      </button>
    );
  };

  if (loading) {
    return (
      <div style={card}>
        <div style={{ padding: 20, color: "#64748b", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={card}>
        <div style={{ padding: 20, color: "#94a3b8", fontSize: 14 }}>Unable to load balance flow.</div>
      </div>
    );
  }

  const investments = getCat("Investments");
  const dividendReceived = getCat("Dividend Received");
  const sponsorsEquity = getCat("Sponsor's Equity");
  const profitFromBank = getCat("Profit Received from Bank");
  const otherCharges = getCat("Other Charges");

  // Fund Contributions / Redemption / Distribution Paid are sourced from portal data (Investments,
  // RedemptionForms, MonthlyDistributionLogs — cumulative through yesterday), not from how bank
  // transactions happen to be categorized. This is what makes Variance below a real reconciliation
  // signal instead of a number that's definitionally always in sync with the category tiles.
  const portal = data.portalCapitalFlow;
  const totalFundContributions = portal.fundContributionsTotal;
  const fundContributionsCount = portal.fundContributionsCount;
  const totalRedemption = portal.redemptionCapitalTotal;
  const redemptionCount = portal.redemptionCount;
  const totalDistribution = portal.distributionTotal;
  const distributionCount = portal.distributionCount;
  // monthlyDistributionOnlyTotal excludes redemption interest (see PortalCapitalFlowDTO); the
  // remainder of distributionTotal against it is the interest paid out on exit via redemptions.
  const totalMonthlyDistributionOnly = Math.abs(portal.monthlyDistributionOnlyTotal);
  const totalDistributionOnExit = Math.abs(totalDistribution) - totalMonthlyDistributionOnly;
  const totalInvestments = investments?.total ?? 0;
  // Dividend Received, Sponsor's Equity, and Profit Received from Bank are always inflows to the
  // fund and must always add into Total Balance Available. Force positive here rather than trusting
  // the bank-transaction category's own signed Total, since a handful of debit-side transactions
  // miscategorized under one of these inflow categories shouldn't flip the whole tile (and the
  // downstream sum) negative.
  const totalDividendReceived = Math.abs(dividendReceived?.total ?? 0);
  const totalSponsorsEquity = Math.abs(sponsorsEquity?.total ?? 0);
  const totalProfitFromBank = Math.abs(profitFromBank?.total ?? 0);
  const totalOtherCharges = otherCharges?.total ?? 0;

  const balanceRemaining = totalFundContributions + totalRedemption;
  const afterDistribution = balanceRemaining + totalDistribution;
  const totalBalanceAvailable =
    afterDistribution + totalInvestments + totalDividendReceived + totalSponsorsEquity + totalProfitFromBank + totalOtherCharges;

  // Calculated Balance, not the bank's own reported Balance — see the file-level comment above.
  const bankBalance = data.latestCalculatedBalance;
  const variance = bankBalance != null ? bankBalance - totalBalanceAvailable : null;

  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "20px 24px",
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0e3416" }}>
          Balance Flow (Since Inception)
        </div>
        <button onClick={load} style={btn("#64748b")}>
          ↻ Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, alignItems: "stretch" }}>
        {tile({
          label: "Fund Contributions",
          value: fundContributionsCount > 0 ? signedFlow(totalFundContributions) : "No transactions yet",
          accent: "#0e3416",
          muted: fundContributionsCount === 0,
          sub: "From portal data",
          onClick: () => router.push("/capital-ledger?type=Contribution"),
        })}
        {tile({
          label: "Redemption",
          value: redemptionCount > 0 ? signedFlow(totalRedemption) : "No transactions yet",
          accent: "#ef4444",
          arrow: true,
          muted: redemptionCount === 0,
          sub: "From portal data",
          onClick: () => router.push("/capital-ledger?type=Redemption"),
        })}
        {tile({ label: "Balance Remaining", value: signedFlow(balanceRemaining), accent: "#6366f1" })}
        {tile({
          label: "Distribution Paid",
          value: distributionCount > 0 ? signedFlow(totalDistribution) : "No transactions yet",
          accent: "#f59e0b",
          arrow: true,
          muted: distributionCount === 0,
          breakdown:
            distributionCount > 0 && totalDistributionOnExit > 0
              ? `${fmt(totalMonthlyDistributionOnly)} monthly + ${fmt(totalDistributionOnExit)} on exit`
              : undefined,
          sub: "From portal data",
          onClick: () => router.push("/capital-ledger?type=Redemption,Dividend"),
        })}

        {tile({ label: "After Distributions", value: signedFlow(afterDistribution), accent: "#10b981" })}
        {tile({
          label: "Investments",
          value: investments && investments.count > 0 ? signedFlow(totalInvestments) : "No transactions yet",
          accent: "#8b5cf6",
          arrow: true,
          muted: !investments || investments.count === 0,
          onClick: investments ? () => onViewCategory(String(investments.categoryId)) : undefined,
        })}
        {tile({
          label: "Dividend Received",
          value: dividendReceived && dividendReceived.count > 0 ? signedFlow(totalDividendReceived) : "No transactions yet",
          accent: "#b8923a",
          muted: !dividendReceived || dividendReceived.count === 0,
          onClick: dividendReceived ? () => onViewCategory(String(dividendReceived.categoryId)) : undefined,
        })}
        {tile({
          label: "Sponsor's Equity",
          value: sponsorsEquity && sponsorsEquity.count > 0 ? signedFlow(totalSponsorsEquity) : "No transactions yet",
          accent: "#699172",
          muted: !sponsorsEquity || sponsorsEquity.count === 0,
          onClick: sponsorsEquity ? () => onViewCategory(String(sponsorsEquity.categoryId)) : undefined,
        })}

        {tile({
          label: "Profit Received from Bank",
          value: profitFromBank && profitFromBank.count > 0 ? signedFlow(totalProfitFromBank) : "No transactions yet",
          accent: "#0f2342",
          muted: !profitFromBank || profitFromBank.count === 0,
          onClick: profitFromBank ? () => onViewCategory(String(profitFromBank.categoryId)) : undefined,
        })}
        {tile({
          label: "Other Charges / Expenses",
          value: otherCharges && otherCharges.count > 0 ? signedFlow(totalOtherCharges) : "No transactions yet",
          accent: "#ef4444",
          arrow: true,
          muted: !otherCharges || otherCharges.count === 0,
          onClick: otherCharges ? () => onViewCategory(String(otherCharges.categoryId)) : undefined,
        })}
        {tile({ label: "Total Balance Available", value: signedFlow(totalBalanceAvailable), accent: "#699172" })}
        {variance != null
          ? tile({
              label: "Variance",
              value: `${variance >= 0 ? "+" : "−"}${fmt(Math.abs(variance))}`,
              accent: variance >= 0 ? "#10b981" : "#ef4444",
              arrow: true,
              onClick: () => onViewCategory("uncategorized"),
            })
          : tile({ label: "Variance", value: "N/A", accent: "#94a3b8", arrow: true, muted: true })}

        {/* Bank Account Balance — full width, Calculated Balance of the latest imported Posted transaction */}
        <button
          type="button"
          onClick={() => onViewCategory(null)}
          style={{
            gridColumn: "1 / -1",
            background: bankBalance != null ? "linear-gradient(135deg, #f0f4f8 0%, #e8edf5 100%)" : "#f8fafc",
            border: `1px solid ${bankBalance != null ? "#b0bdd0" : "#e2e8f0"}`,
            borderTop: "3px solid #0f2342",
            borderRadius: 8,
            padding: "12px 14px",
            opacity: bankBalance != null ? 1 : 0.65,
            cursor: "pointer",
            transition: "box-shadow 0.15s",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "")}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 6 }}>
            Bank Account Balance
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: bankBalance != null ? "#0f2342" : "#94a3b8", flex: 1, letterSpacing: "0.01em" }}>
            {bankBalance != null ? fmt(bankBalance) : "No transactions imported yet"}
          </div>
          <div style={{ fontSize: 10, color: "#699172", marginTop: 6, fontWeight: 600 }}>View all transactions →</div>
        </button>
      </div>
    </div>
  );
}
