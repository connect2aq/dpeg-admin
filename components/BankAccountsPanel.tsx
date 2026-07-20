"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, InvestorBankAccount } from "@/lib/api";
import { BankAccountPicker } from "./BankAccountPicker";

interface BankAccountsPanelProps {
  userId: number;
  isSuperAdmin: boolean;
}

export function BankAccountsPanel({ userId, isSuperAdmin }: BankAccountsPanelProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [deactivated, setDeactivated] = useState<InvestorBankAccount[]>([]);
  const [isLoadingDeactivated, setIsLoadingDeactivated] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadDeactivated = useCallback(async () => {
    setIsLoadingDeactivated(true);
    try {
      const res = await adminApi.getUserDeactivatedBankAccounts(userId);
      setDeactivated(res.success && res.data ? res.data : []);
    } finally {
      setIsLoadingDeactivated(false);
    }
  }, [userId]);

  useEffect(() => {
    if (showDeactivated) loadDeactivated();
  }, [showDeactivated, loadDeactivated, refreshKey]);

  const handleReactivate = async (id: number) => {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await adminApi.reactivateUserBankAccount(userId, id);
      if (!res.success) throw new Error(res.message || "Failed to reactivate bank account");
      setMsg({
        text: isSuperAdmin
          ? "Bank account reactivated."
          : res.message || "Submitted for approval.",
        ok: true,
      });
      if (isSuperAdmin) setRefreshKey((k) => k + 1);
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : "Failed to reactivate bank account",
        ok: false,
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <BankAccountPicker
        key={refreshKey}
        userId={userId}
        isSuperAdmin={isSuperAdmin}
        selectedId={selectedId}
        onSelect={setSelectedId}
        description="This investor's saved payout/funding accounts. Selecting one has no effect here — use this to add, deactivate, or reprioritize accounts."
      />

      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          onClick={() => setShowDeactivated((v) => !v)}
          style={{
            background: "none",
            border: "none",
            color: "#64748b",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {showDeactivated ? "Hide deactivated accounts" : "Show deactivated accounts"}
        </button>
      </div>

      {msg && (
        <div
          style={{
            fontSize: 12,
            color: msg.ok ? "#166534" : "#b91c1c",
            marginTop: 8,
          }}
        >
          {msg.text}
        </div>
      )}

      {showDeactivated && (
        <div style={{ marginTop: 10 }}>
          {isLoadingDeactivated ? (
            <p style={{ fontSize: 13, color: "#64748b" }}>Loading…</p>
          ) : deactivated.length === 0 ? (
            <p style={{ fontSize: 13, color: "#94a3b8" }}>No deactivated accounts.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {deactivated.map((acc) => (
                <div
                  key={acc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    opacity: 0.75,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>
                      {acc.label ? `${acc.label} — ` : ""}
                      {acc.bankName}
                    </span>
                    <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0" }}>
                      {acc.accountHolderName} • ••••{acc.accountNumber.slice(-4)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === acc.id}
                    onClick={() => handleReactivate(acc.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#2563eb",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    Reactivate
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
