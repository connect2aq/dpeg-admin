"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { PaginationControls } from "@/components/PaginationControls";
import { SortableTh } from "@/components/SortableTh";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import {
  bankTransactionsApi,
  type BankCapitalLedgerEntry,
  type BankCapitalLedgerResult,
  type BankTransactionBalanceFlow,
  type TransactionCategoryItem,
} from "@/lib/api";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import { formatShortDate } from "@/lib/dateFormat";
import { downloadCsv } from "@/lib/exportCsv";
import { buildSubCategoryOptionsForSelection } from "@/lib/bankTransactions/categoryTree";

const DEFAULT_PAGE_SIZE = 25;

function fmtMoney(n?: number) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function signed(n: number) {
  return `${n < 0 ? "−" : ""}${fmtMoney(Math.abs(n))}`;
}

const s = {
  h1: { fontSize: 22, fontWeight: 700, color: "#0f2342", marginBottom: 4 } as React.CSSProperties,
  sub: { color: "#64748b", fontSize: 14, marginBottom: 24 } as React.CSSProperties,
  card: {
    background: "#fff",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "20px 24px",
    marginBottom: 20,
  } as React.CSSProperties,
  btn: (color: string, disabled?: boolean): React.CSSProperties => ({
    padding: "8px 18px",
    borderRadius: 6,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
    fontWeight: 600,
    background: disabled ? "#d1d5db" : color,
    color: "#fff",
    opacity: disabled ? 0.7 : 1,
  }),
  input: {
    padding: "10px 14px",
    border: "1.5px solid #e2e8f0",
    borderRadius: 8,
    fontSize: 14,
    color: "#0f172a",
  } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: {
    padding: "8px 10px",
    textAlign: "left" as const,
    background: "#0f2342",
    color: "#fff",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
  },
  td: { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", color: "#1a1a2e" },
};

const statCard = (label: string, value: string, color: string, sub?: string) => (
  <div
    key={label}
    style={{
      background: "#fff",
      border: "1.5px solid #e2e8f0",
      borderRadius: 10,
      padding: "14px 20px",
      minWidth: 170,
    }}
  >
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "#64748b",
        marginBottom: 6,
      }}
    >
      {label}
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{sub}</div>}
  </div>
);

type SortField = "date" | "amount" | "balance" | "category" | "description";

export default function BankCapitalLedgerPage() {
  const [activeTab, setActiveTab] = useState<"balance-flow" | "ledger">("balance-flow");
  const [categories, setCategories] = useState<TransactionCategoryItem[]>([]);

  useEffect(() => {
    bankTransactionsApi.getCategories(false).then((res) => {
      if (res.success) setCategories(res.data);
    });
  }, []);

  // ── Ledger tab state ──────────────────────────────────────────────────────
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [subCategoryIds, setSubCategoryIds] = useState<string[]>([]);
  const [direction, setDirection] = useState<"" | "in" | "out">("");
  const [linkFilter, setLinkFilter] = useState<"" | "linked" | "unlinked">("");
  const [search, setSearch] = useState("");
  const [investorSearch, setInvestorSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [exporting, setExporting] = useState(false);

  const [ledgerData, setLedgerData] = useState<BankCapitalLedgerResult | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  // True only for the curated view landed on by clicking a Balance Flow tile — swaps the generic
  // Credit/Debit/Net Change KPI row for one scoped to that category. Any manual interaction with the
  // Ledger tab's own controls (filters, sort, tabs, reset) exits this view back to the normal one.
  const [viaBalanceFlow, setViaBalanceFlow] = useState(false);

  // Only From/To are sent to the API — everything else is filtered/sorted client-side over the
  // full result, the same architecture Fund Capital Ledger uses, because Running Balance/Opening
  // Balance only make sense computed over the true chronological sequence.
  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const res = await bankTransactionsApi.getLedger({ from: from || undefined, to: to || undefined });
      if (res.success) setLedgerData(res.data);
    } finally {
      setLedgerLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const categoryFilterOptions = [
    { value: "uncategorized", label: "Uncategorized" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];
  const subCategoryFilterOptions = buildSubCategoryOptionsForSelection(categories, categoryIds);

  // KPI cards reflect the full From/To range exactly as loaded from the API — unaffected by the
  // Category/Sub-Category/search/etc. filters below, the same way Fund Capital Ledger's stat cards
  // come from backend-computed totals over the date range, not the further-filtered client view.
  const rangeStats = useMemo(() => {
    const entries = ledgerData?.entries ?? [];
    const totalIn = entries.reduce((sum, e) => sum + (e.credit ?? 0), 0);
    const totalOut = entries.reduce((sum, e) => sum + (e.debit ?? 0), 0);
    const netChange = entries.reduce((sum, e) => sum + e.amount, 0);
    const closingBalance = entries.length > 0 ? entries[entries.length - 1].calculatedBalance ?? null : null;
    return { totalIn, totalOut, netChange, closingBalance, count: entries.length };
  }, [ledgerData]);

  const visibleEntries = useMemo(() => {
    const entries = ledgerData?.entries ?? [];
    return entries.filter((e) => {
      if (categoryIds.length > 0) {
        const wantsUncategorized = categoryIds.includes("uncategorized");
        const realIds = categoryIds.filter((v) => v !== "uncategorized").map(Number);
        const matchesUncategorized = wantsUncategorized && e.categoryId == null;
        const matchesReal = e.categoryId != null && realIds.includes(e.categoryId);
        if (!matchesUncategorized && !matchesReal) return false;
      }
      if (subCategoryIds.length > 0) {
        if (e.subCategoryId == null || !subCategoryIds.includes(String(e.subCategoryId))) return false;
      }
      if (direction === "in" && e.credit == null) return false;
      if (direction === "out" && e.debit == null) return false;
      if (linkFilter === "linked" && e.linkedCount === 0) return false;
      if (linkFilter === "unlinked" && e.linkedCount > 0) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${e.rawDescription} ${e.adminDescription ?? ""} ${e.checkNumber ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (investorSearch) {
        const q = investorSearch.toLowerCase();
        const hay = `${e.investorName ?? ""} ${e.accountUserName ?? ""} ${e.accountUserEmail ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ledgerData, categoryIds, subCategoryIds, direction, linkFilter, search, investorSearch]);

  const sortValue = (e: BankCapitalLedgerEntry, field: SortField): string | number => {
    switch (field) {
      case "date":
        return new Date(e.date).getTime();
      case "amount":
        return e.amount;
      case "balance":
        return e.calculatedBalance ?? 0;
      case "category":
        return e.categoryName ?? "";
      case "description":
        return e.rawDescription;
    }
  };

  const sortedEntries = useMemo(() => {
    // visibleEntries is already in the backend's one true ascending order (PostDate asc, Id asc —
    // BankTransactionRepository.GetLedgerAsync: OrderBy(PostDate).ThenBy(Id)); the filtering above
    // preserves that relative order. For Date, skip the comparator entirely and just reverse for
    // descending — this guarantees the exact same same-day tiebreak Bank Transactions' own
    // "postdate desc" branch produces (OrderByDescending(PostDate).ThenByDescending(Id)), with zero
    // risk of a client comparator disagreeing with the backend on same-day ties.
    if (sortField === "date") {
      return sortDir === "asc" ? visibleEntries : [...visibleEntries].reverse();
    }

    const arr = [...visibleEntries];
    arr.sort((a, b) => {
      const va = sortValue(a, sortField);
      const vb = sortValue(b, sortField);
      const cmp =
        typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      const signedCmp = sortDir === "asc" ? cmp : -cmp;
      // Deterministic tiebreak by Id, sign-matched to sortDir — mirrors the backend's own
      // ThenBy(Id)/ThenByDescending(Id) convention (BankTransactionRepository.GetTransactionsAsync).
      return signedCmp !== 0 ? signedCmp : sortDir === "asc" ? a.id - b.id : b.id - a.id;
    });
    return arr;
  }, [visibleEntries, sortField, sortDir]);

  const totalCount = sortedEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pagedEntries = sortedEntries.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  // Scoped to visibleEntries (the filtered set), unlike rangeStats above — this is what the
  // Balance-Flow-curated KPI row shows instead of the generic Credit/Debit/Net Change trio.
  const categoryStats = useMemo(() => {
    const sum = visibleEntries.reduce((total, e) => total + e.amount, 0);
    return { sum, count: visibleEntries.length };
  }, [visibleEntries]);

  const categoryLabel =
    categoryIds.length === 1
      ? (categoryFilterOptions.find((o) => o.value === categoryIds[0])?.label ?? "Category")
      : "Category";

  const toggleSort = (key: string) => {
    setViaBalanceFlow(false);
    const field = key as SortField;
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // Running Balance is each row's Calculated Balance (the anchored running total, not the bank's own
  // reported Balance) as of that date — always accurate on its own — but it only builds up as a
  // visually contiguous sequence with every row shown, read in Date order. Date ascending and Date
  // descending are equally contiguous (same running balance, just read top-to-bottom in the opposite
  // direction) — it's any OTHER sort, or any filter that hides rows, that breaks the visual sequence
  // even though each value is still correct.
  const runningBalanceUnreliable =
    categoryIds.length > 0 ||
    subCategoryIds.length > 0 ||
    direction !== "" ||
    linkFilter !== "" ||
    !!search ||
    !!investorSearch ||
    sortField !== "date";

  const resetToDateOrder = () => {
    setViaBalanceFlow(false);
    setCategoryIds([]);
    setSubCategoryIds([]);
    setDirection("");
    setLinkFilter("");
    setSearch("");
    setInvestorSearch("");
    setSortField("date");
    setSortDir("desc");
    setPage(1);
  };

  const resetAllFilters = () => {
    setFrom("");
    setTo("");
    resetToDateOrder();
  };

  const viewCategory = (value: string | null) => {
    setCategoryIds(value == null ? [] : [value]);
    setSubCategoryIds([]);
    setPage(1);
    setActiveTab("ledger");
    // The category-scoped KPI row only makes sense for an actual category (including
    // "uncategorized") — the Bank Account Balance tile's "view everything" click (value === null)
    // still lands on the normal full KPI row since there's no single category to summarize.
    setViaBalanceFlow(value != null);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await bankTransactionsApi.getLedger({ from: from || undefined, to: to || undefined });
      if (res.success) {
        const rows = res.data.entries.map((e) => [
          formatShortDate(e.date),
          e.rawDescription,
          e.adminDescription ?? "",
          e.checkNumber ?? "",
          e.debit ?? "",
          e.credit ?? "",
          e.calculatedBalance ?? "",
          e.categoryName ?? "",
          e.subCategoryName ?? "",
          e.linkedEntityType ?? "",
          e.investorName ?? "",
          e.accountUserName ?? "",
          e.accountUserEmail ?? "",
        ]);
        downloadCsv(
          [
            [
              "Date",
              "Description",
              "Notes",
              "Check #",
              "Debit",
              "Credit",
              "Calculated Balance",
              "Category",
              "Sub-Category",
              "Linked Type",
              "Investor",
              "Account User",
              "Account User Email",
            ],
            ...rows,
          ],
          "bank-capital-ledger.csv",
        );
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="page-content">
        <h1 style={s.h1}>Bank Capital Ledger</h1>
        <p style={s.sub}>
          Read-only view of the fund&apos;s bank-driven capital ledger — where fund money sits by
          category, and every posted bank transaction with its category, sub-category, and any
          linked investment, redemption, or distribution.
        </p>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid #e2e8f0" }}>
          {(
            [
              { key: "balance-flow", label: "Balance Flow" },
              { key: "ledger", label: "Ledger" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key);
                setViaBalanceFlow(false);
              }}
              style={{
                padding: "10px 18px",
                border: "none",
                borderBottom: activeTab === t.key ? "2px solid #b8923a" : "2px solid transparent",
                background: "transparent",
                fontSize: 14,
                fontWeight: 600,
                color: activeTab === t.key ? "#0f2342" : "#64748b",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "balance-flow" && <BalanceFlowTab onViewCategory={viewCategory} />}

        {activeTab === "ledger" && (
          <>
            {/* Filters */}
            <div style={{ ...s.card, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                  setViaBalanceFlow(false);
                }}
                style={s.input}
              />
              <span style={{ color: "#94a3b8", fontSize: 13 }}>to</span>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                  setViaBalanceFlow(false);
                }}
                style={s.input}
              />
              <MultiSelectFilter
                options={categoryFilterOptions}
                selectedValues={categoryIds}
                onChange={(v) => {
                  setCategoryIds(v);
                  const valid = new Set(buildSubCategoryOptionsForSelection(categories, v).map((o) => o.value));
                  setSubCategoryIds((prev) => prev.filter((id) => valid.has(id)));
                  setPage(1);
                  setViaBalanceFlow(false);
                }}
                allLabel="All Categories"
                buttonLabel="Category"
              />
              <MultiSelectFilter
                options={subCategoryFilterOptions}
                selectedValues={subCategoryIds}
                onChange={(v) => {
                  setSubCategoryIds(v);
                  setPage(1);
                  setViaBalanceFlow(false);
                }}
                allLabel="All Sub-Categories"
                buttonLabel="Sub-Category"
              />
              <select
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value as typeof direction);
                  setPage(1);
                  setViaBalanceFlow(false);
                }}
                style={s.input}
              >
                <option value="">Credit &amp; Debit</option>
                <option value="in">Credit</option>
                <option value="out">Debit</option>
              </select>
              <select
                value={linkFilter}
                onChange={(e) => {
                  setLinkFilter(e.target.value as typeof linkFilter);
                  setPage(1);
                  setViaBalanceFlow(false);
                }}
                style={s.input}
              >
                <option value="">Linked or Unlinked</option>
                <option value="linked">Linked only</option>
                <option value="unlinked">Unlinked only</option>
              </select>
              <input
                type="text"
                placeholder="Search description, check #..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                  setViaBalanceFlow(false);
                }}
                style={{ ...s.input, minWidth: 200 }}
              />
              <input
                type="text"
                placeholder="Search Account User or Investor…"
                value={investorSearch}
                onChange={(e) => {
                  setInvestorSearch(e.target.value);
                  setPage(1);
                  setViaBalanceFlow(false);
                }}
                style={{ ...s.input, minWidth: 220 }}
              />
              <button onClick={resetAllFilters} style={s.btn("#64748b")}>
                Reset
              </button>
              <button onClick={exportCsv} disabled={exporting} style={s.btn("#699172", exporting)}>
                {exporting ? "Exporting…" : "⬇ Export CSV"}
              </button>
            </div>

            {ledgerLoading ? (
              <div style={s.card}>
                <div style={{ padding: 20, color: "#64748b", fontSize: 14 }}>Loading…</div>
              </div>
            ) : !ledgerData ? (
              <div style={s.card}>
                <div style={{ padding: 20, color: "#94a3b8", fontSize: 14 }}>Unable to load the ledger.</div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                  {viaBalanceFlow ? (
                    <>
                      {statCard(
                        `${categoryLabel} Total`,
                        signed(categoryStats.sum),
                        categoryStats.sum >= 0 ? "#0f9444" : "#991b1b",
                      )}
                      {ledgerData.openingBalance !== 0 &&
                        statCard(
                          "Opening Balance",
                          fmtMoney(ledgerData.openingBalance),
                          "#0f2342",
                          from ? `as at ${from}` : undefined,
                        )}
                      {rangeStats.closingBalance != null &&
                        statCard(
                          "Closing Balance",
                          fmtMoney(rangeStats.closingBalance),
                          "#0f2342",
                          to ? `as at ${to}` : "latest imported balance",
                        )}
                      {statCard("Transactions", String(categoryStats.count), "#699172")}
                    </>
                  ) : (
                    <>
                      {ledgerData.openingBalance !== 0 &&
                        statCard(
                          "Opening Balance",
                          fmtMoney(ledgerData.openingBalance),
                          "#0f2342",
                          from ? `as at ${from}` : undefined,
                        )}
                      {statCard("Total Credit", fmtMoney(rangeStats.totalIn), "#0f9444")}
                      {statCard("Total Debit", fmtMoney(rangeStats.totalOut), "#991b1b")}
                      {statCard(
                        "Net Change",
                        signed(rangeStats.netChange),
                        rangeStats.netChange >= 0 ? "#0f9444" : "#991b1b",
                      )}
                      {rangeStats.closingBalance != null &&
                        statCard(
                          "Closing Balance",
                          fmtMoney(rangeStats.closingBalance),
                          "#0f2342",
                          to ? `as at ${to}` : "latest imported balance",
                        )}
                      {statCard("Transactions", String(rangeStats.count), "#699172")}
                    </>
                  )}
                </div>

                {runningBalanceUnreliable && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      marginBottom: 16,
                      padding: "12px 18px",
                      background: "#eff6ff",
                      border: "1.5px solid #bfdbfe",
                      borderRadius: 10,
                    }}
                  >
                    <span style={{ fontSize: 16, lineHeight: "18px" }}>ℹ️</span>
                    <span style={{ fontSize: 13, color: "#1e40af", lineHeight: 1.5, flex: 1 }}>
                      <strong>Calculated Balance</strong> is each row&rsquo;s anchored running total as of that
                      date — always accurate on its own — but it only reads as a contiguous sequence
                      oldest → newest with every row shown. A category, sub-category, direction,
                      linked, or search filter hides rows, and any sort other than Date (oldest first)
                      reorders them — either way, consecutive rows won&rsquo;t look contiguous, even
                      though every value shown is still correct. Clear filters and sort by Date
                      ascending to see it build up in order. (The From/To date range is fine on its own
                      — Opening Balance above already accounts for it.)
                    </span>
                    <button onClick={resetToDateOrder} style={s.btn("#1d4ed8")}>
                      Reset to Date order
                    </button>
                  </div>
                )}

                <div style={s.card}>
                  {pagedEntries.length === 0 ? (
                    <div style={{ padding: 20, color: "#94a3b8", fontSize: 14 }}>
                      No transactions found for the current filters.
                    </div>
                  ) : (
                    <>
                      <div style={{ overflowX: "auto" }}>
                        <table style={s.table}>
                          <thead>
                            <tr>
                              <SortableTh label="Date" sortKey="date" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                              <SortableTh
                                label="Description"
                                sortKey="description"
                                sortOn={sortField}
                                sortDirection={sortDir}
                                onSort={toggleSort}
                                style={s.th}
                              />
                              <th style={s.th}>Notes</th>
                              <th style={s.th}>Check #</th>
                              <th style={{ ...s.th, textAlign: "right" }}>Debit</th>
                              <th style={{ ...s.th, textAlign: "right" }}>Credit</th>
                              <SortableTh
                                label="Balance"
                                sortKey="balance"
                                sortOn={sortField}
                                sortDirection={sortDir}
                                onSort={toggleSort}
                                style={{ ...s.th, textAlign: "right" }}
                              />
                              <SortableTh
                                label="Category"
                                sortKey="category"
                                sortOn={sortField}
                                sortDirection={sortDir}
                                onSort={toggleSort}
                                style={s.th}
                              />
                              <th style={s.th}>Sub-Category</th>
                              <th style={s.th}>Linked Type</th>
                              <th style={s.th}>Account User</th>
                              <th style={s.th}>Investor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedEntries.map((e) => (
                              <tr key={e.id}>
                                <td style={s.td}>{formatShortDate(e.date)}</td>
                                <td style={{ ...s.td, maxWidth: 260 }} title={e.rawDescription}>
                                  {e.rawDescription}
                                </td>
                                <td style={s.td}>{e.adminDescription || "—"}</td>
                                <td style={s.td}>{e.checkNumber ?? "—"}</td>
                                <td style={{ ...s.td, textAlign: "right", color: "#991b1b" }}>
                                  {e.debit != null ? fmtMoney(e.debit) : ""}
                                </td>
                                <td style={{ ...s.td, textAlign: "right", color: "#0f9444" }}>
                                  {e.credit != null ? fmtMoney(e.credit) : ""}
                                </td>
                                <td style={{ ...s.td, textAlign: "right" }}>
                                  {e.calculatedBalance != null ? fmtMoney(e.calculatedBalance) : "—"}
                                </td>
                                <td style={s.td}>{e.categoryName ?? "Uncategorized"}</td>
                                <td style={s.td}>{e.subCategoryName ?? "—"}</td>
                                <td style={s.td}>{e.linkedEntityType ?? "—"}</td>
                                <td style={s.td}>
                                  {e.accountUserId ? (
                                    <Link
                                      href={`/investor-statements?userId=${e.accountUserId}`}
                                      style={{ color: "#0f2342", fontWeight: 600 }}
                                    >
                                      {e.accountUserName || "—"}
                                      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 400 }}>
                                        {e.accountUserEmail}
                                      </div>
                                    </Link>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td style={s.td}>{e.investorName ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <PaginationControls
                          page={page}
                          totalPages={totalPages}
                          onPageChange={setPage}
                          pageSize={pageSize}
                          onPageSizeChange={(n) => {
                            setPageSize(n);
                            setPage(1);
                          }}
                          pageSizeOptions={PAGE_SIZE_OPTIONS}
                          summary={`${totalCount} transaction(s)`}
                        />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

// ── Balance Flow tab ─────────────────────────────────────────────────────
// Mirrors the Dashboard's "Balance Flow" card visually, but every number here is
// derived purely from categorized bank transactions rather than manually-entered
// figures — so "Bank Account Balance" is Calculated Balance (the anchored running
// total, not the bank's own reported Balance), and "Variance" against it catches
// both miscategorized/uncategorized activity AND transactions the admin forgot to
// import in the first place, since a missing transaction breaks the running total.

function BalanceFlowTab({ onViewCategory }: { onViewCategory: (value: string | null) => void }) {
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
    sub?: string;
    onClick?: () => void;
  }) => {
    const { label, value, accent, arrow, muted, sub, onClick } = opts;
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
        {sub && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{sub}</div>}
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
      <div style={s.card}>
        <div style={{ padding: 20, color: "#64748b", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={s.card}>
        <div style={{ padding: 20, color: "#94a3b8", fontSize: 14 }}>Unable to load balance flow.</div>
      </div>
    );
  }

  const fundContributions = getCat("Fund Contributions");
  const redemption = getCat("Redemption");
  const distribution = getCat("Distribution");
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
  const totalInvestments = investments?.total ?? 0;
  // Dividend Received, Sponsor's Equity, and Profit Received from Bank are always inflows to the
  // fund and must always add into Total Balance Available — matching the Dashboard's own Balance
  // Flow formula, which hard-codes these three with a "+" regardless of sign (dashboard/page.tsx's
  // BalanceFlow: "afterDividend - deployedAmount + interestReceived + dividendReceived +
  // sponsoredEquity - otherCharges"). Force positive here rather than trusting the bank-transaction
  // category's own signed Total, since a handful of debit-side transactions miscategorized under
  // one of these inflow categories shouldn't flip the whole tile (and the downstream sum) negative.
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
          Balance Flow (Since Inception) — from {data.totalTransactionCount} imported transaction(s)
          {data.latestBalanceDate && ` — Balance as at ${formatShortDate(data.latestBalanceDate)}`}
        </div>
        <button onClick={load} style={s.btn("#64748b")}>
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
          onClick: fundContributions ? () => onViewCategory(String(fundContributions.categoryId)) : undefined,
        })}
        {tile({
          label: "Redemption",
          value: redemptionCount > 0 ? signedFlow(totalRedemption) : "No transactions yet",
          accent: "#ef4444",
          arrow: true,
          muted: redemptionCount === 0,
          sub: "From portal data",
          onClick: redemption ? () => onViewCategory(String(redemption.categoryId)) : undefined,
        })}
        {tile({ label: "Balance Remaining", value: signedFlow(balanceRemaining), accent: "#6366f1" })}
        {tile({
          label: "Distribution Paid",
          value: distributionCount > 0 ? signedFlow(totalDistribution) : "No transactions yet",
          accent: "#f59e0b",
          arrow: true,
          muted: distributionCount === 0,
          sub: "From portal data",
          onClick: distribution ? () => onViewCategory(String(distribution.categoryId)) : undefined,
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
            Bank Account Balance (Calculated)
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: bankBalance != null ? "#0f2342" : "#94a3b8", flex: 1, letterSpacing: "0.01em" }}>
            {bankBalance != null ? fmt(bankBalance) : "No transactions imported yet"}
          </div>
          <div style={{ fontSize: 10, color: "#699172", marginTop: 6, fontWeight: 600 }}>View all transactions →</div>
        </button>
      </div>

      {data.uncategorizedCount > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 8,
            fontSize: 12,
            color: "#92400e",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span>
            ⚠ {data.uncategorizedCount} transaction(s) totaling {signedFlow(data.uncategorizedTotal)} are still
            uncategorized — the totals above won&apos;t fully reconcile against the bank balance until these are
            tagged.
          </span>
          <button onClick={() => onViewCategory("uncategorized")} style={s.btn("#b8923a")}>
            View uncategorized →
          </button>
        </div>
      )}
    </div>
  );
}
