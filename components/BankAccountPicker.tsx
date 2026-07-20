"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, InvestorBankAccount } from "@/lib/api";

const inputStyle = {
  width: "100%",
  padding: "8px 11px",
  border: "1.5px solid #e2e8f0",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box" as const,
};
const labelStyle = {
  fontSize: 11,
  fontWeight: 700 as const,
  color: "#475569",
  display: "block" as const,
  marginBottom: 3,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};

function isValidRoutingNumber(v?: string) {
  return !!v && /^\d{9}$/.test(v);
}

const emptyForm = {
  bankName: "",
  accountHolderName: "",
  routingNumber: "",
  accountNumber: "",
  label: "",
};

interface BankAccountPickerProps {
  userId: number;
  isSuperAdmin: boolean;
  selectedId: number | null;
  onSelect: (accountId: number) => void;
  description?: string;
}

export function BankAccountPicker({
  userId,
  isSuperAdmin,
  selectedId,
  onSelect,
  description = "Select the investor's saved bank account, or add a new one.",
}: BankAccountPickerProps) {
  const [accounts, setAccounts] = useState<InvestorBankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [isLoadingDeactivated, setIsLoadingDeactivated] = useState(false);
  const [deactivatedAccounts, setDeactivatedAccounts] = useState<InvestorBankAccount[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getUserBankAccounts(userId);
      const list = res.success && res.data ? res.data : [];
      setAccounts(list);
      if (list.length === 0) setIsAdding(true);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const isFormValid =
    !!form.bankName &&
    !!form.accountHolderName &&
    isValidRoutingNumber(form.routingNumber) &&
    !!form.accountNumber;

  const handleAdd = async () => {
    if (!isFormValid) return;
    setIsSaving(true);
    setMsg(null);
    try {
      const res = await adminApi.addUserBankAccount(userId, {
        bankName: form.bankName,
        accountHolderName: form.accountHolderName,
        routingNumber: form.routingNumber,
        accountNumber: form.accountNumber,
        label: form.label || undefined,
        setPrimary: accounts.length === 0,
      });
      if (!res.success) throw new Error(res.message || "Failed to save bank account");
      setForm(emptyForm);
      setIsAdding(false);
      if (isSuperAdmin && res.data?.id) {
        await load();
        onSelect(res.data.id);
        setMsg({ text: "Bank account saved.", ok: true });
      } else {
        setMsg({ text: res.message || "Submitted for approval.", ok: true });
      }
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : "Failed to save bank account",
        ok: false,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetPrimary = async (id: number) => {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await adminApi.setUserBankAccountPrimary(userId, id);
      if (!res.success) throw new Error(res.message || "Failed to update primary account");
      if (isSuperAdmin) await load();
      setMsg({
        text: isSuperAdmin
          ? "Primary account updated."
          : res.message || "Submitted for approval.",
        ok: true,
      });
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : "Failed to update primary account",
        ok: false,
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDeactivate = async (id: number) => {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await adminApi.deactivateUserBankAccount(userId, id);
      if (!res.success) throw new Error(res.message || "Failed to deactivate bank account");
      if (isSuperAdmin) {
        await load();
        if (showDeactivated) await loadDeactivated();
      }
      setMsg({
        text: isSuperAdmin
          ? "Bank account deactivated."
          : res.message || "Submitted for approval.",
        ok: true,
      });
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : "Failed to deactivate bank account",
        ok: false,
      });
    } finally {
      setBusyId(null);
    }
  };

  const loadDeactivated = useCallback(async () => {
    setIsLoadingDeactivated(true);
    try {
      const res = await adminApi.getUserDeactivatedBankAccounts(userId);
      setDeactivatedAccounts(res.success && res.data ? res.data : []);
    } finally {
      setIsLoadingDeactivated(false);
    }
  }, [userId]);

  const toggleShowDeactivated = () => {
    const next = !showDeactivated;
    setShowDeactivated(next);
    if (next) loadDeactivated();
  };

  const handleReactivate = async (id: number) => {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await adminApi.reactivateUserBankAccount(userId, id);
      if (!res.success) throw new Error(res.message || "Failed to reactivate bank account");
      if (isSuperAdmin) {
        await load();
        await loadDeactivated();
      }
      setMsg({
        text: isSuperAdmin
          ? "Bank account reactivated."
          : res.message || "Submitted for approval.",
        ok: true,
      });
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : "Failed to reactivate bank account",
        ok: false,
      });
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return <p style={{ fontSize: 13, color: "#64748b" }}>Loading bank accounts…</p>;
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>{description}</p>

      {msg && (
        <div
          style={{
            fontSize: 12,
            color: msg.ok ? "#166534" : "#b91c1c",
            marginBottom: 10,
          }}
        >
          {msg.text}
        </div>
      )}

      {accounts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {accounts.map((acc) => (
            <div
              key={acc.id}
              onClick={() => onSelect(acc.id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                background: selectedId === acc.id ? "#eff6ff" : "#f8fafc",
                border:
                  selectedId === acc.id
                    ? "1.5px solid #93c5fd"
                    : "1px solid #e2e8f0",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                checked={selectedId === acc.id}
                onChange={() => onSelect(acc.id)}
                style={{ margin: "3px 0 0" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>
                    {acc.label ? `${acc.label} — ` : ""}
                    {acc.bankName}
                  </span>
                  {acc.isPrimary && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        padding: "2px 7px",
                        borderRadius: 10,
                        background: "#0f2342",
                        color: "#fff",
                      }}
                    >
                      Primary
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "4px 16px",
                    fontSize: 12,
                    color: "#334155",
                  }}
                >
                  <div>
                    <span style={{ color: "#94a3b8" }}>Account Holder: </span>
                    {acc.accountHolderName}
                  </div>
                  <div>
                    <span style={{ color: "#94a3b8" }}>Account #: </span>
                    <span style={{ fontFamily: "monospace" }}>{acc.accountNumber}</span>
                  </div>
                  <div>
                    <span style={{ color: "#94a3b8" }}>Routing #: </span>
                    <span style={{ fontFamily: "monospace" }}>{acc.routingNumber}</span>
                  </div>
                  <div>
                    <span style={{ color: "#94a3b8" }}>Added: </span>
                    {new Date(acc.createdOn).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexShrink: 0, marginTop: 3 }}>
                {!acc.isPrimary && (
                  <button
                    type="button"
                    disabled={busyId === acc.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetPrimary(acc.id);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#2563eb",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Make primary
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === acc.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeactivate(acc.id);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#b91c1c",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Deactivate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: showDeactivated ? 10 : 0 }}>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            style={{
              background: "none",
              border: "none",
              color: "#2563eb",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              padding: 0,
            }}
          >
            + Add another bank account
          </button>
        )}
        <button
          type="button"
          onClick={toggleShowDeactivated}
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

      {showDeactivated && (
        <div style={{ marginBottom: 12 }}>
          {isLoadingDeactivated ? (
            <p style={{ fontSize: 13, color: "#64748b" }}>Loading…</p>
          ) : deactivatedAccounts.length === 0 ? (
            <p style={{ fontSize: 13, color: "#94a3b8" }}>No deactivated accounts.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {deactivatedAccounts.map((acc) => (
                <div
                  key={acc.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 12px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    opacity: 0.75,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>
                      {acc.label ? `${acc.label} — ` : ""}
                      {acc.bankName}
                    </span>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "4px 16px",
                        fontSize: 12,
                        color: "#334155",
                        marginTop: 6,
                      }}
                    >
                      <div>
                        <span style={{ color: "#94a3b8" }}>Account Holder: </span>
                        {acc.accountHolderName}
                      </div>
                      <div>
                        <span style={{ color: "#94a3b8" }}>Account #: </span>
                        <span style={{ fontFamily: "monospace" }}>{acc.accountNumber}</span>
                      </div>
                      <div>
                        <span style={{ color: "#94a3b8" }}>Routing #: </span>
                        <span style={{ fontFamily: "monospace" }}>{acc.routingNumber}</span>
                      </div>
                      <div>
                        <span style={{ color: "#94a3b8" }}>Added: </span>
                        {new Date(acc.createdOn).toLocaleDateString()}
                      </div>
                    </div>
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
                      marginTop: 3,
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

      {isAdding && (
        <div
          style={{
            padding: 14,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            marginTop: 8,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 10,
            }}
          >
            <div>
              <label style={labelStyle}>Bank Name</label>
              <input
                style={inputStyle}
                value={form.bankName}
                onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))}
              />
            </div>
            <div>
              <label style={labelStyle}>Account Holder Name</label>
              <input
                style={inputStyle}
                value={form.accountHolderName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, accountHolderName: e.target.value }))
                }
              />
            </div>
            <div>
              <label style={labelStyle}>Routing Number</label>
              <input
                style={inputStyle}
                value={form.routingNumber}
                onChange={(e) =>
                  setForm((p) => ({ ...p, routingNumber: e.target.value }))
                }
              />
              {form.routingNumber && !isValidRoutingNumber(form.routingNumber) && (
                <span style={{ fontSize: 11, color: "#b91c1c" }}>
                  Routing number must be exactly 9 digits.
                </span>
              )}
            </div>
            <div>
              <label style={labelStyle}>Account Number</label>
              <input
                style={inputStyle}
                value={form.accountNumber}
                onChange={(e) =>
                  setForm((p) => ({ ...p, accountNumber: e.target.value }))
                }
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Label (optional)</label>
              <input
                style={inputStyle}
                placeholder="e.g. Chase Checking"
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={!isFormValid || isSaving}
              onClick={handleAdd}
              style={{
                padding: "8px 16px",
                background: "#0f2342",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: !isFormValid || isSaving ? "not-allowed" : "pointer",
                opacity: !isFormValid || isSaving ? 0.6 : 1,
              }}
            >
              {isSaving
                ? "Saving..."
                : isSuperAdmin
                  ? "Save Account"
                  : "Submit for Approval"}
            </button>
            {accounts.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setForm(emptyForm);
                  setMsg(null);
                }}
                style={{
                  padding: "8px 16px",
                  background: "white",
                  color: "#475569",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
