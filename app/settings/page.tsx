"use client";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { SortableTh } from "@/components/SortableTh";
import {
  adminApi,
  bankTransactionsApi,
  type BankDetails,
  type NotificationEmail,
  type DailyBalanceLog,
  type TransactionCategoryItem,
} from "@/lib/api";
import { formatShortDate } from "@/lib/dateFormat";

type BalanceSortField =
  | "date"
  | "bankAccountBalance"
  | "deployedAmount"
  | "interestReceived"
  | "dividendReceived"
  | "sponsoredEquity"
  | "otherCharges";
const balanceSortValue = (
  b: DailyBalanceLog,
  field: BalanceSortField,
): string | number => {
  switch (field) {
    case "date":
      return new Date(b.date).getTime();
    case "bankAccountBalance":
      return b.bankAccountBalance;
    case "deployedAmount":
      return b.deployedAmount;
    case "interestReceived":
      return b.interestReceived ?? -Infinity;
    case "dividendReceived":
      return b.dividendReceived ?? -Infinity;
    case "sponsoredEquity":
      return b.sponsoredEquity ?? -Infinity;
    case "otherCharges":
      return b.otherCharges ?? -Infinity;
  }
};

const EMPTY: BankDetails = {
  beneficiaryName: "",
  bankName: "",
  accountNumber: "",
  routingSwiftCode: "",
  address: "",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const EMPTY_BALANCE: DailyBalanceLog = {
  date: todayIso(),
  bankAccountBalance: 0,
  deployedAmount: 0,
  interestReceived: 0,
  dividendReceived: 0,
  sponsoredEquity: 0,
  otherCharges: 0,
  notes: "",
};

export default function SettingsPage() {
  const [form, setForm] = useState<BankDetails>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    null,
  );

  const [notifEmails, setNotifEmails] = useState<NotificationEmail[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);

  const [categories, setCategories] = useState<TransactionCategoryItem[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryMsg, setCategoryMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);

  const [balances, setBalances] = useState<DailyBalanceLog[]>([]);
  const [balanceForm, setBalanceForm] =
    useState<DailyBalanceLog>(EMPTY_BALANCE);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceSaving, setBalanceSaving] = useState(false);
  const [balanceMsg, setBalanceMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);
  const [balanceSort, setBalanceSort] = useState<BalanceSortField>("date");
  const [balanceSortDir, setBalanceSortDir] = useState<"asc" | "desc">("desc");
  const toggleBalanceSort = (field: string) => {
    const f = field as BalanceSortField;
    if (balanceSort === f)
      setBalanceSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setBalanceSort(f);
      setBalanceSortDir("asc");
    }
  };

  const loadBalances = () =>
    adminApi.getDailyBalances().then((r) => {
      if (r.success && r.data) setBalances(r.data);
    });

  useEffect(() => {
    adminApi
      .getBankDetails()
      .then((r) => {
        if (r.success && r.data) setForm({ ...EMPTY, ...r.data });
      })
      .finally(() => setLoading(false));
    adminApi
      .getNotificationEmails()
      .then((r) => {
        if (r.success && r.data) setNotifEmails(r.data);
      })
      .finally(() => setNotifLoading(false));
    bankTransactionsApi
      .getCategories(true)
      .then((r) => {
        if (r.success && r.data) setCategories(r.data);
      })
      .finally(() => setCategoriesLoading(false));
    loadBalances().finally(() => setBalanceLoading(false));
  }, []);

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setAddingCategory(true);
    setCategoryMsg(null);
    const nextSortOrder =
      categories.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1;
    const r = await bankTransactionsApi.createCategory(
      newCategoryName.trim(),
      nextSortOrder,
    );
    if (r.success) {
      const listRes = await bankTransactionsApi.getCategories(true);
      if (listRes.success && listRes.data) setCategories(listRes.data);
      setNewCategoryName("");
      setCategoryMsg({ text: "Category added.", ok: true });
    } else {
      setCategoryMsg({ text: r.message || "Failed to add category.", ok: false });
    }
    setAddingCategory(false);
  };

  const toggleCategoryActive = async (c: TransactionCategoryItem) => {
    const r = await bankTransactionsApi.updateCategory(c.id, {
      name: c.name,
      isActive: !c.isActive,
      sortOrder: c.sortOrder,
    });
    if (r.success)
      setCategories((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, isActive: !x.isActive } : x)),
      );
  };

  const saveBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    setBalanceSaving(true);
    setBalanceMsg(null);
    try {
      const r = await adminApi.saveDailyBalance(balanceForm);
      setBalanceMsg({
        text: r.success
          ? "Daily balance saved."
          : (r.message ?? "Save failed."),
        ok: r.success,
      });
      if (r.success) await loadBalances();
    } catch {
      setBalanceMsg({
        text: "An error occurred. Please try again.",
        ok: false,
      });
    } finally {
      setBalanceSaving(false);
    }
  };

  const addEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAddingEmail(true);
    setEmailMsg(null);
    const r = await adminApi.addNotificationEmail(
      newEmail.trim(),
      newLabel.trim() || undefined,
    );
    if (r.success && r.data) {
      setNotifEmails((prev) => [...prev, r.data!]);
      setNewEmail("");
      setNewLabel("");
    }
    setEmailMsg({
      text: r.success ? "Email added." : (r.message ?? "Failed"),
      ok: r.success,
    });
    setAddingEmail(false);
    setTimeout(() => setEmailMsg(null), 4000);
  };

  const removeEmail = async (id: number) => {
    const r = await adminApi.deleteNotificationEmail(id);
    if (r.success) setNotifEmails((prev) => prev.filter((e) => e.id !== id));
  };

  const set =
    (field: keyof BankDetails) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const r = await adminApi.saveBankDetails(form);
      setMessage({
        text: r.success
          ? "Bank details saved successfully."
          : (r.message ?? "Save failed."),
        ok: r.success,
      });
    } catch {
      setMessage({ text: "An error occurred. Please try again.", ok: false });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 6,
  };

  return (
    <AdminLayout>
      <div className="page-content">
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#0f2342",
            marginBottom: 4,
          }}
        >
          Settings
        </h1>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
          Configure bank details used in the funding instructions email sent to
          investors when an application is sent to signers.
        </p>

        <div className="card">
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#0f2342",
              marginBottom: 20,
            }}
          >
            Bank Details
          </h2>

          {loading ? (
            <p style={{ color: "#64748b", fontSize: 14 }}>Loading…</p>
          ) : (
            <form onSubmit={save}>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                <div>
                  <label style={labelStyle}>Beneficiary Name</label>
                  <input
                    style={inputStyle}
                    value={form.beneficiaryName}
                    onChange={set("beneficiaryName")}
                    placeholder="e.g. DPEG Real Estate Fund, LP"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Bank Name</label>
                  <input
                    style={inputStyle}
                    value={form.bankName}
                    onChange={set("bankName")}
                    placeholder="e.g. Chase Bank"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Account Number</label>
                  <input
                    style={inputStyle}
                    value={form.accountNumber}
                    onChange={set("accountNumber")}
                    placeholder="Account number"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Routing Number / SWIFT Code</label>
                  <input
                    style={inputStyle}
                    value={form.routingSwiftCode}
                    onChange={set("routingSwiftCode")}
                    placeholder="Routing or SWIFT code"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Address</label>
                  <textarea
                    style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
                    value={form.address}
                    onChange={set("address")}
                    placeholder="Office address shown in email footer"
                  />
                </div>
              </div>

              {message && (
                <div
                  style={{
                    marginTop: 16,
                    padding: "10px 14px",
                    borderRadius: 6,
                    fontSize: 13,
                    background: message.ok ? "#f0fdf4" : "#fef2f2",
                    color: message.ok ? "#15803d" : "#b91c1c",
                    border: `1px solid ${message.ok ? "#bbf7d0" : "#fecaca"}`,
                  }}
                >
                  {message.text}
                </div>
              )}

              <div style={{ marginTop: 20 }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: "#0f2342",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "10px 24px",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Saving…" : "Save Bank Details"}
                </button>
              </div>
            </form>
          )}
        </div>
        {/* Daily Balances */}
        <div className="card" style={{ marginTop: 28 }}>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#0f2342",
              marginBottom: 6,
            }}
          >
            Daily Balances
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
            Enter the closing Bank Account Balance and Deployed Amount for a
            given date. One entry per day — saving again for the same date
            overwrites that day&apos;s entry. The dashboard uses the most recent
            entry.
          </p>

          {balanceLoading ? (
            <p style={{ color: "#64748b", fontSize: 14 }}>Loading…</p>
          ) : (
            <>
              <form
                onSubmit={saveBalance}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                  marginBottom: 20,
                }}
              >
                <div>
                  <label style={labelStyle}>Date</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={balanceForm.date.slice(0, 10)}
                    onChange={(e) =>
                      setBalanceForm((f) => ({ ...f, date: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Bank Account Balance</label>
                  <input
                    type="number"
                    step="0.01"
                    style={inputStyle}
                    value={balanceForm.bankAccountBalance}
                    onChange={(e) =>
                      setBalanceForm((f) => ({
                        ...f,
                        bankAccountBalance: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Deployed in Projects</label>
                  <input
                    type="number"
                    step="0.01"
                    style={inputStyle}
                    value={balanceForm.deployedAmount}
                    onChange={(e) =>
                      setBalanceForm((f) => ({
                        ...f,
                        deployedAmount: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Interest Received</label>
                  <input
                    type="number"
                    step="0.01"
                    style={inputStyle}
                    value={balanceForm.interestReceived}
                    onChange={(e) =>
                      setBalanceForm((f) => ({
                        ...f,
                        interestReceived: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Dividend Received</label>
                  <input
                    type="number"
                    step="0.01"
                    style={inputStyle}
                    value={balanceForm.dividendReceived}
                    onChange={(e) =>
                      setBalanceForm((f) => ({
                        ...f,
                        dividendReceived: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Sponsored Equity</label>
                  <input
                    type="number"
                    step="0.01"
                    style={inputStyle}
                    value={balanceForm.sponsoredEquity}
                    onChange={(e) =>
                      setBalanceForm((f) => ({
                        ...f,
                        sponsoredEquity: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Other Charges / Expenses</label>
                  <input
                    type="number"
                    step="0.01"
                    style={inputStyle}
                    value={balanceForm.otherCharges}
                    onChange={(e) =>
                      setBalanceForm((f) => ({
                        ...f,
                        otherCharges: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div style={{ flex: "1 1 200px" }}>
                  <label style={labelStyle}>Notes (optional)</label>
                  <input
                    style={inputStyle}
                    value={balanceForm.notes ?? ""}
                    onChange={(e) =>
                      setBalanceForm((f) => ({ ...f, notes: e.target.value }))
                    }
                  />
                </div>
                <button
                  type="submit"
                  disabled={balanceSaving}
                  style={{
                    padding: "9px 18px",
                    background: "#0f2342",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: balanceSaving ? "not-allowed" : "pointer",
                    opacity: balanceSaving ? 0.7 : 1,
                  }}
                >
                  {balanceSaving ? "Saving…" : "Save Entry"}
                </button>
              </form>

              {balanceMsg && (
                <div
                  style={{
                    marginBottom: 16,
                    fontSize: 13,
                    color: balanceMsg.ok ? "#15803d" : "#b91c1c",
                  }}
                >
                  {balanceMsg.text}
                </div>
              )}

              {balances.length > 0 && (
                <div className="table-scroll" style={{ height: 400 }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr>
                        {(() => {
                          return (
                            <>
                              <SortableTh
                                label="Date"
                                sortKey="date"
                                sortOn={balanceSort}
                                sortDirection={balanceSortDir}
                                onSort={toggleBalanceSort}
                              />
                              <SortableTh
                                label="Bank Account Balance"
                                sortKey="bankAccountBalance"
                                sortOn={balanceSort}
                                sortDirection={balanceSortDir}
                                onSort={toggleBalanceSort}
                              />
                              <SortableTh
                                label="Deployed Amount"
                                sortKey="deployedAmount"
                                sortOn={balanceSort}
                                sortDirection={balanceSortDir}
                                onSort={toggleBalanceSort}
                              />
                              <SortableTh
                                label="Interest Received"
                                sortKey="interestReceived"
                                sortOn={balanceSort}
                                sortDirection={balanceSortDir}
                                onSort={toggleBalanceSort}
                              />
                              <SortableTh
                                label="Dividend Received"
                                sortKey="dividendReceived"
                                sortOn={balanceSort}
                                sortDirection={balanceSortDir}
                                onSort={toggleBalanceSort}
                              />
                              <SortableTh
                                label="Sponsored Equity"
                                sortKey="sponsoredEquity"
                                sortOn={balanceSort}
                                sortDirection={balanceSortDir}
                                onSort={toggleBalanceSort}
                              />
                              <SortableTh
                                label="Other Charges"
                                sortKey="otherCharges"
                                sortOn={balanceSort}
                                sortDirection={balanceSortDir}
                                onSort={toggleBalanceSort}
                              />
                              <th>Notes</th>
                              <th></th>
                            </>
                          );
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {[...balances]
                        .sort((a, b) => {
                          const av = balanceSortValue(a, balanceSort);
                          const bv = balanceSortValue(b, balanceSort);
                          if (av < bv) return balanceSortDir === "asc" ? -1 : 1;
                          if (av > bv) return balanceSortDir === "asc" ? 1 : -1;
                          return 0;
                        })
                        .map((b) => (
                          <tr key={b.date}>
                            <td
                              style={{
                                padding: "8px 10px",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              {formatShortDate(b.date)}
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              ${b.bankAccountBalance.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              ${b.deployedAmount.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              {b.interestReceived
                                ? `$${b.interestReceived.toLocaleString()}`
                                : "—"}
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              {b.dividendReceived
                                ? `$${b.dividendReceived.toLocaleString()}`
                                : "—"}
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              {b.sponsoredEquity
                                ? `$${b.sponsoredEquity.toLocaleString()}`
                                : "—"}
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              {b.otherCharges
                                ? `$${b.otherCharges.toLocaleString()}`
                                : "—"}
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                borderBottom: "1px solid #f1f5f9",
                                color: "#64748b",
                              }}
                            >
                              {b.notes || "—"}
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              <button
                                onClick={() =>
                                  setBalanceForm({
                                    ...b,
                                    date: b.date.slice(0, 10),
                                  })
                                }
                                style={{
                                  padding: "3px 10px",
                                  background: "#f8fafc",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 5,
                                  fontSize: 12,
                                  color: "#0f2342",
                                  cursor: "pointer",
                                }}
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Notification Emails */}
        <div className="card" style={{ marginTop: 28 }}>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#0f2342",
              marginBottom: 6,
            }}
          >
            Admin Notification Emails
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
            System alerts (Odoo failures, mismatch alerts, job errors) are sent
            to these addresses. If none are configured, alerts fall back to the
            default admin email.
          </p>

          {notifLoading ? (
            <p style={{ fontSize: 13, color: "#64748b" }}>Loading…</p>
          ) : (
            <>
              {notifEmails.length > 0 && (
                <div
                  style={{
                    marginBottom: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {notifEmails.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        background: "#f8fafc",
                        borderRadius: 6,
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          fontSize: 14,
                          color: "#1a1a2e",
                          fontWeight: 500,
                        }}
                      >
                        {e.emailAddress}
                      </span>
                      {e.label && (
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>
                          {e.label}
                        </span>
                      )}
                      <button
                        onClick={() => removeEmail(e.id)}
                        style={{
                          padding: "3px 10px",
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          borderRadius: 5,
                          fontSize: 12,
                          color: "#b91c1c",
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form
                onSubmit={addEmail}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  style={{ ...inputStyle, flex: "1 1 200px", maxWidth: 260 }}
                />
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Label (optional)"
                  style={{ ...inputStyle, flex: "1 1 150px", maxWidth: 200 }}
                />
                <button
                  type="submit"
                  disabled={addingEmail}
                  style={{
                    padding: "9px 18px",
                    background: "#0f2342",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: addingEmail ? "not-allowed" : "pointer",
                    opacity: addingEmail ? 0.7 : 1,
                  }}
                >
                  {addingEmail ? "Adding…" : "Add Email"}
                </button>
              </form>

              {emailMsg && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 13,
                    color: emailMsg.ok ? "#15803d" : "#b91c1c",
                  }}
                >
                  {emailMsg.text}
                </div>
              )}
            </>
          )}
        </div>

        {/* Transaction Categories */}
        <div className="card" style={{ marginTop: 28 }}>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#0f2342",
              marginBottom: 6,
            }}
          >
            Bank Transaction Categories
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
            Categories used to tag imported bank transactions. Deactivate a
            category instead of deleting it — past transactions keep their
            category even after it's turned off.
          </p>

          {categoriesLoading ? (
            <p style={{ fontSize: 13, color: "#64748b" }}>Loading…</p>
          ) : (
            <>
              {categories.length > 0 && (
                <div
                  style={{
                    marginBottom: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {categories
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((c) => (
                      <div
                        key={c.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          background: "#f8fafc",
                          borderRadius: 6,
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            fontSize: 14,
                            color: c.isActive ? "#1a1a2e" : "#94a3b8",
                            fontWeight: 500,
                          }}
                        >
                          {c.name}
                        </span>
                        <button
                          onClick={() => toggleCategoryActive(c)}
                          style={{
                            padding: "3px 10px",
                            background: c.isActive ? "#f0fdf4" : "#fef2f2",
                            border: c.isActive
                              ? "1px solid #bbf7d0"
                              : "1px solid #fecaca",
                            borderRadius: 5,
                            fontSize: 12,
                            color: c.isActive ? "#166534" : "#b91c1c",
                            cursor: "pointer",
                          }}
                        >
                          {c.isActive ? "Active" : "Inactive"}
                        </button>
                      </div>
                    ))}
                </div>
              )}

              <form
                onSubmit={addCategory}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name"
                  required
                  style={{ ...inputStyle, flex: "1 1 200px", maxWidth: 260 }}
                />
                <button
                  type="submit"
                  disabled={addingCategory}
                  style={{
                    padding: "9px 18px",
                    background: "#0f2342",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: addingCategory ? "not-allowed" : "pointer",
                    opacity: addingCategory ? 0.7 : 1,
                  }}
                >
                  {addingCategory ? "Adding…" : "Add Category"}
                </button>
              </form>

              {categoryMsg && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 13,
                    color: categoryMsg.ok ? "#15803d" : "#b91c1c",
                  }}
                >
                  {categoryMsg.text}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
