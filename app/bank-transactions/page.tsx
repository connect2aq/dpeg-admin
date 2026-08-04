"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { PaginationControls } from "@/components/PaginationControls";
import { SortableTh } from "@/components/SortableTh";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { EditableStatusBadge } from "@/components/StatusBadge";
import { EntitySearchCombobox } from "@/components/EntitySearchCombobox";
import {
  bankTransactionsApi,
  type BankTransactionListItem,
  type BankTransactionImportResult,
  type BankTransactionLinkItem,
  type BankAccountBalanceAnchor,
  type BankTransactionBalanceFlow,
  type BankCapitalLedgerResult,
  type LinkCandidate,
  type LinkedEntityType,
  type PagedResult,
  type TransactionCategoryItem,
} from "@/lib/api";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import { formatShortDate } from "@/lib/dateFormat";
import {
  findCategoryById,
  resolveCategorySelection,
  buildSubCategoryOptionsForSelection,
} from "@/lib/bankTransactions/categoryTree";

const DEFAULT_PAGE_SIZE = 25;

function fmtMoney(n?: number) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtSigned(n: number) {
  return `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#0f2342", marginBottom: 12 } as React.CSSProperties,
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
  table: { borderCollapse: "collapse" as const, fontSize: 11.5, tableLayout: "fixed" as const },
  th: {
    padding: "6px 6px",
    textAlign: "left" as const,
    background: "#0f2342",
    color: "#fff",
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase" as const,
  },
  td: { padding: "6px 6px", borderBottom: "1px solid #f1f5f9", color: "#1a1a2e", overflow: "hidden" },
  iconBtn: (color: string, disabled?: boolean): React.CSSProperties => ({
    padding: "3px 7px",
    borderRadius: 5,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    lineHeight: 1.4,
    background: disabled ? "#d1d5db" : color,
    color: "#fff",
    opacity: disabled ? 0.7 : 1,
  }),
};

export default function BankTransactionsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadResult, setUploadResult] = useState<BankTransactionImportResult | null>(null);

  const [result, setResult] = useState<PagedResult<BankTransactionListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<TransactionCategoryItem[]>([]);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [subCategoryIds, setSubCategoryIds] = useState<string[]>([]);
  const [linkFilter, setLinkFilter] = useState<"" | "linked" | "unlinked">("");
  const [direction, setDirection] = useState<"" | "in" | "out">("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  // Default view is newest-first by posted date. Same-day ties resolve via the backend's
  // ThenByDescending(Id) on the "postdate" branch (BankTransactionRepository.GetTransactionsAsync),
  // i.e. most-recently-imported-first within a day — bank-capital-ledger's default Date-desc view
  // mirrors this same tiebreak so the two pages stay visually consistent.
  const [sortOn, setSortOn] = useState("postdate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false);
  const [linkEntityType, setLinkEntityType] = useState<LinkedEntityType>("Investment");
  const [selectedCandidate, setSelectedCandidate] = useState<LinkCandidate | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [flow, setFlow] = useState<BankTransactionBalanceFlow | null>(null);

  // KPI cards: reuses the same unpaginated ledger endpoint Bank Capital Ledger's stat cards are
  // built on, so the numbers stay in sync between the two pages. Only From/To go to the API; the
  // Category/Sub-Category/Direction/Linked/search filters below are applied client-side, mirroring
  // Bank Capital Ledger's own visibleEntries filter exactly (both read the same CategoryId/
  // SubCategoryId shape from BankTransactionRepository.GetLedgerAsync).
  const [statsData, setStatsData] = useState<BankCapitalLedgerResult | null>(null);

  const loadStats = useCallback(async () => {
    const res = await bankTransactionsApi.getLedger({ from: from || undefined, to: to || undefined });
    if (res.success) setStatsData(res.data);
  }, [from, to]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const [anchors, setAnchors] = useState<BankAccountBalanceAnchor[]>([]);
  const [anchorListOpen, setAnchorListOpen] = useState(false);
  const [anchorModalAccount, setAnchorModalAccount] = useState<string | null>(null);
  const [anchorValue, setAnchorValue] = useState("");
  const [savingAnchor, setSavingAnchor] = useState(false);
  const [anchorError, setAnchorError] = useState("");

  const [addOpen, setAddOpen] = useState(false);

  const toggleSort = (key: string) => {
    if (sortOn === key) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortOn(key);
      setSortDirection("asc");
    }
    setPage(1);
  };

  // Debounce the free-text search box so we don't hit the API on every keystroke
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The backend's categoryIds filter is a raw literal-id match (a transaction's CategoryId
      // points at whichever level it was actually tagged at). So a selected top-level Category
      // needs to expand to "itself + all its children" here — otherwise a transaction tagged at a
      // sub-category wouldn't match its parent's Category filter, breaking the rollup semantics
      // used everywhere else in this feature (Balance Flow, Bank Capital Ledger).
      const wantsUncategorized = categoryIds.includes("uncategorized");
      const topIds = categoryIds.filter((v) => v !== "uncategorized");
      const expanded = topIds.flatMap((id) => {
        const cat = categories.find((c) => String(c.id) === id);
        return cat ? [String(cat.id), ...cat.subCategories.map((s) => String(s.id))] : [id];
      });
      const finalCategoryIds = [...new Set([...expanded, ...subCategoryIds])];

      const res = await bankTransactionsApi.list({
        page,
        pageSize,
        from: from || undefined,
        to: to || undefined,
        categoryIds: wantsUncategorized ? undefined : finalCategoryIds.length ? finalCategoryIds : undefined,
        uncategorizedOnly: wantsUncategorized ? true : undefined,
        linkedOnly: linkFilter === "linked" ? true : undefined,
        unlinkedOnly: linkFilter === "unlinked" ? true : undefined,
        direction: direction || undefined,
        search: search || undefined,
        sortOn,
        sortDirection,
      });
      if (res.success) setResult(res.data);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, from, to, categoryIds, subCategoryIds, categories, linkFilter, direction, search, sortOn, sortDirection]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    bankTransactionsApi.getCategories(false).then((res) => {
      if (res.success) setCategories(res.data);
    });
  }, []);

  const loadAnchors = useCallback(async () => {
    const res = await bankTransactionsApi.getBalanceAnchors();
    if (res.success) setAnchors(res.data);
  }, []);

  useEffect(() => {
    loadAnchors();
  }, [loadAnchors]);

  const loadFlow = useCallback(async () => {
    const res = await bankTransactionsApi.getBalanceFlow();
    if (res.success) setFlow(res.data);
  }, []);

  useEffect(() => {
    loadFlow();
  }, [loadFlow]);

  const filteredStatsEntries = useMemo(() => {
    const entries = statsData?.entries ?? [];
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
      return true;
    });
  }, [statsData, categoryIds, subCategoryIds, direction, linkFilter, search]);

  const cardStats = useMemo(() => {
    const totalIn = filteredStatsEntries.reduce((sum, e) => sum + (e.credit ?? 0), 0);
    const totalOut = filteredStatsEntries.reduce((sum, e) => sum + (e.debit ?? 0), 0);
    const netChange = filteredStatsEntries.reduce((sum, e) => sum + e.amount, 0);
    return { totalIn, totalOut, netChange, count: filteredStatsEntries.length };
  }, [filteredStatsEntries]);

  const openAnchorModal = (account: BankAccountBalanceAnchor) => {
    setAnchorModalAccount(account.accountNumber);
    setAnchorValue(
      account.startingCalculatedBalance != null
        ? String(account.startingCalculatedBalance)
        : account.firstTransactionBalance != null
          ? String(account.firstTransactionBalance)
          : "",
    );
    setAnchorError("");
  };

  const saveAnchor = async () => {
    if (!anchorModalAccount) return;
    const value = Number(anchorValue);
    if (Number.isNaN(value)) {
      setAnchorError("Enter a valid number.");
      return;
    }
    setSavingAnchor(true);
    setAnchorError("");
    try {
      const res = await bankTransactionsApi.setBalanceAnchor(anchorModalAccount, value);
      if (res.success) {
        setAnchorModalAccount(null);
        await loadAnchors();
        load();
        loadFlow();
      } else setAnchorError(res.message);
    } finally {
      setSavingAnchor(false);
    }
  };

  const categoryFilterOptions = [
    { value: "uncategorized", label: "Uncategorized" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];
  const subCategoryFilterOptions = buildSubCategoryOptionsForSelection(categories, categoryIds);

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadError("Please select a .csv or .qbo file first.");
      return;
    }
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    try {
      const res = await bankTransactionsApi.upload(file);
      if (res.success) {
        setUploadResult(res.data);
        load();
        loadAnchors();
        loadFlow();
        loadStats();
      } else setUploadError(res.message || "Upload failed.");
    } catch {
      setUploadError("Network error. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Row actions ───────────────────────────────────────────────────────────

  // Patch a single row in place rather than re-fetching the whole page — a full
  // reload after every edit re-sorts the list and visibly moves the row the admin
  // just touched (or the next one they meant to edit), which makes categorizing a
  // run of rows one after another frustrating.
  const updateRowInPlace = (id: number, patch: Partial<BankTransactionListItem>) => {
    setResult((prev) =>
      prev
        ? { ...prev, items: prev.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
        : prev,
    );
  };

  const saveAdminDescription = async (row: BankTransactionListItem, value: string) => {
    if (value === (row.adminDescription ?? "")) return;
    const res = await bankTransactionsApi.update(row.id, { adminDescription: value });
    if (res.success) updateRowInPlace(row.id, { adminDescription: value });
  };

  const changeCategory = async (row: BankTransactionListItem, value: string) => {
    const categoryId = value === "" ? null : Number(value);
    const res = await bankTransactionsApi.setCategory(row.id, categoryId);
    if (res.success) {
      const categoryName = categoryId == null ? undefined : findCategoryById(categories, categoryId)?.name;
      updateRowInPlace(row.id, { categoryId: categoryId ?? undefined, categoryName });
      loadStats();
    }
  };

  const deleteRow = async (row: BankTransactionListItem) => {
    const warning =
      row.linkedCount > 0
        ? `This transaction has ${row.linkedCount} link(s) — remove them first before deleting. Continue anyway?`
        : "Delete this transaction? This can't be undone from here.";
    if (!confirm(warning)) return;
    const res = await bankTransactionsApi.remove(row.id);
    if (!res.success) alert(res.message);
    load();
    loadFlow();
    loadStats();
  };

  // ── Selection & bulk link ────────────────────────────────────────────────

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const items = result?.items ?? [];
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id)),
    );
  };

  const selectedRows = (result?.items ?? []).filter((r) => selected.has(r.id));
  const selectedTotal = selectedRows.reduce((sum, r) => sum + r.amount, 0);

  const confirmBulkLink = async () => {
    if (!selectedCandidate) return;
    setLinking(true);
    setLinkError("");
    try {
      const res = await bankTransactionsApi.bulkLink({
        bankTransactionIds: Array.from(selected),
        linkedEntityType: selectedCandidate.entityType,
        linkedEntityId: selectedCandidate.entityId,
      });
      if (res.success) {
        setBulkLinkOpen(false);
        setSelectedCandidate(null);
        setSelected(new Set());
        load();
        loadStats();
      } else setLinkError(res.message);
    } finally {
      setLinking(false);
    }
  };

  const deleteSelected = async () => {
    if (
      !confirm(
        `Delete ${selected.size} selected transaction(s)? Any that are linked will be skipped — remove their links first. This can't be undone from here.`,
      )
    )
      return;
    setBulkDeleting(true);
    try {
      const res = await bankTransactionsApi.bulkDelete(Array.from(selected));
      if (res.success) {
        const { deleted, skippedLinked } = res.data;
        if (skippedLinked > 0) {
          alert(`Deleted ${deleted}, skipped ${skippedLinked} — they have existing links. Remove the links first, then delete again.`);
        }
        setSelected(new Set());
        load();
        loadFlow();
        loadStats();
      } else alert(res.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="page-content">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h1 style={{ ...s.h1, marginBottom: 0 }}>Manage Bank Statements</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => setAddOpen(true)} style={s.btn("#0f2342")}>
              + Add Transaction
            </button>
            <button onClick={() => setAnchorListOpen(true)} style={{ fontSize: 13, color: "#b8923a", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              ⚙ Starting Balances
            </button>
            <Link
              href="/bank-transactions/history"
              style={{ fontSize: 13, color: "#b8923a", fontWeight: 600, textDecoration: "none" }}
            >
              View Import History →
            </Link>
          </div>
        </div>
        <p style={s.sub}>
          Import the fund&apos;s bank account history, categorize each line, and
          tag transactions against the matching Investment, Redemption, or
          Distribution record. Only Posted transactions are imported — Pending
          rows are skipped until they post on a later export. For fund totals
          and a read-only ledger view, see Bank Capital Ledger.
        </p>

        {anchors.filter((a) => a.startingCalculatedBalance == null).length > 0 && (
          <div
            style={{
              ...s.card,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {anchors
              .filter((a) => a.startingCalculatedBalance == null)
              .map((a) => (
                <div
                  key={a.accountNumber}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
                >
                  <span style={{ fontSize: 13, color: "#92400e" }}>
                    ⚠ No starting balance set for account <strong>{a.accountNumber}</strong> — Calculated Balance
                    can&apos;t be shown until you set one.
                    {a.firstTransactionBalance != null && (
                      <>
                        {" "}
                        Its earliest transaction ({a.firstTransactionDate ? formatShortDate(a.firstTransactionDate) : "—"}) has a bank
                        Balance of <strong>{fmtMoney(a.firstTransactionBalance)}</strong> — a natural starting point.
                      </>
                    )}
                  </span>
                  <button onClick={() => openAnchorModal(a)} style={s.btn("#b8923a")}>
                    Set Starting Balance
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* Upload */}
        <div style={s.card}>
          <div style={s.cardTitle}>Import Bank Statement (CSV or QBO)</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept=".csv,.qbo,.ofx" style={{ fontSize: 13, color: "#374151" }} />
            <button onClick={handleUpload} disabled={uploading} style={s.btn("#0f2342", uploading)}>
              {uploading ? "Importing…" : "⬆ Import"}
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
            QBO/OFX files carry each transaction&apos;s own bank-assigned ID, so re-importing an
            overlapping statement automatically skips anything already in.
          </div>
          {uploadError && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: 6,
                color: "#991b1b",
                fontSize: 13,
              }}
            >
              {uploadError}
            </div>
          )}
          {uploadResult && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", gap: 20, fontSize: 13, color: "#64748b", flexWrap: "wrap" }}>
                <span>
                  Total: <strong>{uploadResult.totalRows}</strong>
                </span>
                <span style={{ color: "#166534" }}>
                  Imported: <strong>{uploadResult.succeeded}</strong>
                </span>
                <span style={{ color: "#92400e" }}>
                  Skipped: <strong>{uploadResult.skipped}</strong>
                </span>
                <span style={{ color: "#991b1b" }}>
                  Failed: <strong>{uploadResult.failed}</strong>
                </span>
              </div>
              {uploadResult.failed > 0 && (
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table style={{ ...s.table, width: "100%", tableLayout: "auto" }}>
                    <thead>
                      <tr>
                        <th style={s.th}>Row</th>
                        <th style={s.th}>Description</th>
                        <th style={s.th}>Outcome</th>
                        <th style={s.th}>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResult.rows
                        .filter((r) => r.outcome === "Failed")
                        .map((r) => (
                          <tr key={r.rowNumber}>
                            <td style={s.td}>{r.rowNumber}</td>
                            <td style={s.td}>{r.description ?? "—"}</td>
                            <td style={s.td}>{r.outcome}</td>
                            <td style={{ ...s.td, color: "#991b1b" }}>{r.errorMessage}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reconciliation: portal (system of record) vs bank (what the statement shows) */}
        <div style={{ ...s.card, padding: "14px 20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f2342" }}>
              Reconciliation — Portal vs Bank (Since Inception)
            </div>
            <button onClick={loadFlow} style={s.btn("#64748b")}>
              ↻ Refresh
            </button>
          </div>
          {!flow ? (
            <div style={{ fontSize: 13, color: "#94a3b8" }}>Loading…</div>
          ) : (
            (() => {
              const getCat = (name: string) =>
                flow.categoryTotals.find((c) => c.categoryName.toLowerCase() === name.toLowerCase());
              const bankFundContrib = getCat("Fund Contributions")?.total ?? 0;
              const bankRedemption = getCat("Redemption")?.total ?? 0;
              const bankDistribution = getCat("Distribution")?.total ?? 0;
              const portal = flow.portalCapitalFlow;
              const varianceAccent = (v: number) => (Math.abs(v) < 1 ? "#10b981" : "#ef4444");
              const reconcileCard = (label: string, value: number, accent?: string) => (
                <div
                  key={label + value}
                  style={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: "8px 12px",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: "#94a3b8",
                      marginBottom: 3,
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: accent ?? "#0f2342" }}>
                    {fmtSigned(value)}
                  </div>
                </div>
              );
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {reconcileCard("Total Deposits to Date (From Portal)", portal.fundContributionsTotal)}
                  {reconcileCard("Total Deposits to Date (From Bank)", bankFundContrib)}
                  {reconcileCard(
                    "Variance",
                    bankFundContrib - portal.fundContributionsTotal,
                    varianceAccent(bankFundContrib - portal.fundContributionsTotal),
                  )}

                  {reconcileCard("Redemption (From Portal)", portal.redemptionInclInterestTotal)}
                  {reconcileCard("Redemption (From Bank)", bankRedemption)}
                  {reconcileCard(
                    "Variance",
                    bankRedemption - portal.redemptionInclInterestTotal,
                    varianceAccent(bankRedemption - portal.redemptionInclInterestTotal),
                  )}

                  {reconcileCard("Distribution (From Portal)", portal.monthlyDistributionOnlyTotal)}
                  {reconcileCard("Distribution (From Bank)", bankDistribution)}
                  {reconcileCard(
                    "Variance",
                    bankDistribution - portal.monthlyDistributionOnlyTotal,
                    varianceAccent(bankDistribution - portal.monthlyDistributionOnlyTotal),
                  )}
                </div>
              );
            })()
          )}
        </div>

        {/* Filters */}
        <div style={{ ...s.card, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search description, check #..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ ...s.input, minWidth: 220 }}
          />
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
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
            }}
            allLabel="All Sub-Categories"
            buttonLabel="Sub-Category"
          />
          <select
            value={linkFilter}
            onChange={(e) => {
              setLinkFilter(e.target.value as typeof linkFilter);
              setPage(1);
            }}
            style={s.input}
          >
            <option value="">Linked or Unlinked</option>
            <option value="linked">Linked only</option>
            <option value="unlinked">Unlinked only</option>
          </select>
          <select
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value as typeof direction);
              setPage(1);
            }}
            style={s.input}
          >
            <option value="">Credit &amp; Debit</option>
            <option value="in">Credit</option>
            <option value="out">Debit</option>
          </select>
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setCategoryIds([]);
              setSubCategoryIds([]);
              setLinkFilter("");
              setDirection("");
              setSearchInput("");
              setPage(1);
            }}
            style={s.btn("#64748b")}
          >
            Reset
          </button>
        </div>

        {/* KPI cards — reflect the filters above */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {statsData && statsData.openingBalance !== 0 &&
            statCard(
              "Opening Balance",
              fmtMoney(statsData.openingBalance),
              "#0f2342",
              from ? `as at ${from}` : undefined,
            )}
          {statCard("Total Credit", fmtMoney(cardStats.totalIn), "#0f9444")}
          {statCard("Total Debit", fmtMoney(cardStats.totalOut), "#991b1b")}
          {statCard(
            "Net Change",
            fmtSigned(cardStats.netChange),
            cardStats.netChange >= 0 ? "#0f9444" : "#991b1b",
          )}
          {statCard("Transactions", String(cardStats.count), "#699172")}
        </div>

        {/* Bulk toolbar */}
        {selected.size > 0 && (
          <div
            style={{
              ...s.card,
              display: "flex",
              alignItems: "center",
              gap: 16,
              background: "#fffbeb",
              border: "1px solid #fde68a",
            }}
          >
            <span style={{ fontSize: 13, color: "#92400e" }}>
              <strong>{selected.size}</strong> transaction(s) selected — total{" "}
              <strong>{fmtMoney(selectedTotal)}</strong>
            </span>
            <button onClick={() => setBulkLinkOpen(true)} style={s.btn("#b8923a")}>
              🔗 Link Selected to…
            </button>
            <button onClick={deleteSelected} disabled={bulkDeleting} style={s.btn("#991b1b", bulkDeleting)}>
              {bulkDeleting ? "Deleting…" : "🗑 Delete Selected"}
            </button>
            <button onClick={() => setSelected(new Set())} style={s.btn("#64748b")}>
              Clear Selection
            </button>
          </div>
        )}

        {/* Table */}
        <div style={s.card}>
          {loading ? (
            <div style={{ padding: 20, color: "#64748b", fontSize: 14 }}>Loading…</div>
          ) : !result || result.items.length === 0 ? (
            <div style={{ padding: 20, color: "#94a3b8", fontSize: 14 }}>
              No transactions found. Import a bank statement above to get started.
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={{ ...s.th, width: 24 }}>
                        <input
                          type="checkbox"
                          checked={selected.size === result.items.length && result.items.length > 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <SortableTh label="Date" sortKey="postdate" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={{ ...s.th, width: 64 }} />
                      <th style={{ ...s.th, width: 110 }}>Description</th>
                      <th style={{ ...s.th, width: 90 }}>Notes</th>
                      <th style={{ ...s.th, width: 40 }}>Check #</th>
                      <th style={{ ...s.th, width: 76, textAlign: "right" }}>Debit</th>
                      <th style={{ ...s.th, width: 76, textAlign: "right" }}>Credit</th>
                      <SortableTh label="Balance" sortKey="balance" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={{ ...s.th, width: 100, textAlign: "right" }} />
                      <th style={{ ...s.th, width: 108, textAlign: "right" }}>Calc. Balance</th>
                      <th style={{ ...s.th, width: 190 }}>Category</th>
                      <th style={{ ...s.th, width: 190 }}>Sub-Category</th>
                      <th style={{ ...s.th, width: 60 }}>Linked To</th>
                      <th style={{ ...s.th, width: 34 }}>Link</th>
                      <th style={{ ...s.th, width: 30 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((row) => (
                      <TransactionRow
                        key={row.id}
                        row={row}
                        checked={selected.has(row.id)}
                        onToggle={() => toggleSelect(row.id)}
                        categories={categories}
                        onSaveNotes={(v) => saveAdminDescription(row, v)}
                        onCategoryChange={(v) => changeCategory(row, v)}
                        onDelete={() => deleteRow(row)}
                        onReload={() => {
                          load();
                          loadStats();
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 16 }}>
                <PaginationControls
                  page={result.page}
                  totalPages={result.totalPages}
                  onPageChange={setPage}
                  pageSize={pageSize}
                  onPageSizeChange={(n) => {
                    setPageSize(n);
                    setPage(1);
                  }}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  summary={`${result.totalCount} transaction(s)`}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bulk link modal */}
      {bulkLinkOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setBulkLinkOpen(false)}
        >
          <div
            style={{ background: "white", borderRadius: 10, padding: 24, width: 480, maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f2342", marginBottom: 12 }}>
              Link {selected.size} transaction(s)
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              Selected total: <strong>{fmtMoney(selectedTotal)}</strong>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                Link to
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["Investment", "Redemption", "Distribution"] as LinkedEntityType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setLinkEntityType(t);
                      setSelectedCandidate(null);
                    }}
                    style={s.btn(linkEntityType === t ? "#0f2342" : "#cbd5e1")}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                Search {linkEntityType}
              </label>
              <EntitySearchCombobox key={linkEntityType} entityType={linkEntityType} onSelect={setSelectedCandidate} />
            </div>

            {selectedCandidate && (
              <div
                style={{
                  padding: 10,
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#166534",
                  marginBottom: 16,
                }}
              >
                Selected: {selectedCandidate.displayLabel}
                {selectedCandidate.amount != null &&
                  Math.abs(selectedCandidate.amount - selectedTotal) > 0.01 && (
                    <div style={{ color: "#92400e", marginTop: 4 }}>
                      Note: selected transactions total {fmtMoney(selectedTotal)}, this record is{" "}
                      {fmtMoney(selectedCandidate.amount)} — you can still link a partial amount.
                    </div>
                  )}
              </div>
            )}

            {linkError && (
              <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 12 }}>{linkError}</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setBulkLinkOpen(false)} style={s.btn("#64748b")}>
                Cancel
              </button>
              <button
                onClick={confirmBulkLink}
                disabled={!selectedCandidate || linking}
                style={s.btn("#b8923a", !selectedCandidate || linking)}
              >
                {linking ? "Linking…" : "Confirm Link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Starting balances list */}
      {anchorListOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
          }}
          onClick={() => setAnchorListOpen(false)}
        >
          <div
            style={{ background: "white", borderRadius: 10, padding: 24, width: 480, maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f2342", marginBottom: 12 }}>
              Starting Balances
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              The Calculated Balance shown for each account&apos;s earliest transaction starts from this value.
            </div>
            {anchors.length === 0 ? (
              <div style={{ fontSize: 13, color: "#94a3b8" }}>No bank accounts yet — import a statement first.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {anchors.map((a) => (
                  <div
                    key={a.accountNumber}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13,
                    }}
                  >
                    <span>
                      <strong>{a.accountNumber}</strong>
                      <span style={{ color: "#64748b", marginLeft: 8 }}>
                        {a.startingCalculatedBalance != null ? fmtMoney(a.startingCalculatedBalance) : "Not set"}
                      </span>
                    </span>
                    <button onClick={() => openAnchorModal(a)} style={s.btn("#0f2342")}>
                      {a.startingCalculatedBalance != null ? "Edit" : "Set"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setAnchorListOpen(false)} style={s.btn("#64748b")}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set/edit one account's starting balance */}
      {anchorModalAccount && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 101,
          }}
          onClick={() => setAnchorModalAccount(null)}
        >
          <div
            style={{ background: "white", borderRadius: 10, padding: 24, width: 400, maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f2342", marginBottom: 12 }}>
              Starting Balance — {anchorModalAccount}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              This becomes the Calculated Balance of this account&apos;s chronologically earliest transaction.
              Ideally it matches that transaction&apos;s own bank-reported Balance, so row one shows no mismatch.
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Starting Calculated Balance
            </label>
            <input
              type="number"
              step="0.01"
              value={anchorValue}
              onChange={(e) => setAnchorValue(e.target.value)}
              style={{ ...s.input, width: "100%", marginBottom: 12, boxSizing: "border-box" }}
              autoFocus
            />
            {anchorError && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 12 }}>{anchorError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setAnchorModalAccount(null)} style={s.btn("#64748b")}>
                Cancel
              </button>
              <button onClick={saveAnchor} disabled={savingAnchor} style={s.btn("#b8923a", savingAnchor)}>
                {savingAnchor ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction */}
      {addOpen && (
        <AddTransactionModal
          accounts={anchors.map((a) => a.accountNumber)}
          categories={categories}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            load();
            loadAnchors();
            loadFlow();
            loadStats();
          }}
        />
      )}
    </AdminLayout>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────

function TransactionRow({
  row,
  checked,
  onToggle,
  categories,
  onSaveNotes,
  onCategoryChange,
  onDelete,
  onReload,
}: {
  row: BankTransactionListItem;
  checked: boolean;
  onToggle: () => void;
  categories: TransactionCategoryItem[];
  onSaveNotes: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onDelete: () => void;
  onReload: () => void;
}) {
  const { topId, subId } = resolveCategorySelection(categories, row.categoryId ?? null);
  const topCategoryOptions = [
    { value: "", label: "Uncategorized" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];
  const selectedTopCategory = categories.find((c) => String(c.id) === topId);
  const subCategoryOptions = selectedTopCategory
    ? [
        { value: "", label: "— (category only) —" },
        ...selectedTopCategory.subCategories.map((sub) => ({
          value: String(sub.id),
          label: sub.name,
        })),
      ]
    : [];
  const [notes, setNotes] = useState(row.adminDescription ?? "");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkEntityType, setLinkEntityType] = useState<LinkedEntityType>("Investment");
  const [selectedCandidate, setSelectedCandidate] = useState<LinkCandidate | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [existingLinks, setExistingLinks] = useState<BankTransactionLinkItem[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);

  const loadLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const res = await bankTransactionsApi.getById(row.id);
      if (res.success) setExistingLinks(res.data.links);
    } finally {
      setLoadingLinks(false);
    }
  }, [row.id]);

  useEffect(() => {
    if (linkOpen) loadLinks();
  }, [linkOpen, loadLinks]);

  const addLink = async () => {
    if (!selectedCandidate) return;
    setLinking(true);
    setLinkError("");
    try {
      const res = await bankTransactionsApi.addLink(row.id, {
        linkedEntityType: selectedCandidate.entityType,
        linkedEntityId: selectedCandidate.entityId,
      });
      if (res.success) {
        setSelectedCandidate(null);
        await loadLinks();
        onReload();
      } else setLinkError(res.message);
    } finally {
      setLinking(false);
    }
  };

  const removeLink = async (linkId: number) => {
    if (!confirm("Remove this link?")) return;
    setUnlinkingId(linkId);
    try {
      const res = await bankTransactionsApi.removeLink(linkId);
      if (res.success) {
        await loadLinks();
        onReload();
      } else alert(res.message);
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <>
      <tr>
        <td style={s.td}>
          <input type="checkbox" checked={checked} onChange={onToggle} />
        </td>
        <td style={s.td}>{formatShortDate(row.postDate)}</td>
        <td style={{ ...s.td, wordBreak: "break-word" }} title={row.rawDescription}>
          {row.rawDescription}
        </td>
        <td style={s.td}>
          <input
            type="text"
            defaultValue={notes}
            placeholder="Add a note…"
            onBlur={(e) => {
              setNotes(e.target.value);
              onSaveNotes(e.target.value);
            }}
            style={{ ...s.input, padding: "3px 6px", fontSize: 11, width: "100%", boxSizing: "border-box" }}
          />
        </td>
        <td style={s.td}>{row.checkNumber ?? "—"}</td>
        <td style={{ ...s.td, textAlign: "right", color: "#991b1b" }}>
          {row.debit != null ? fmtMoney(row.debit) : ""}
        </td>
        <td style={{ ...s.td, textAlign: "right", color: "#0f9444" }}>
          {row.credit != null ? fmtMoney(row.credit) : ""}
        </td>
        <td style={{ ...s.td, textAlign: "right" }}>{fmtMoney(row.balance)}</td>
        <td
          style={{
            ...s.td,
            textAlign: "right",
            ...(row.balanceMismatch
              ? { background: "#fee2e2", color: "#991b1b", fontWeight: 700 }
              : {}),
          }}
          title={row.balanceMismatch ? `Doesn't match bank Balance of ${fmtMoney(row.balance)}` : undefined}
        >
          {row.calculatedBalance != null ? fmtMoney(row.calculatedBalance) : "—"}
        </td>
        <td style={s.td}>
          <EditableStatusBadge
            status={topId}
            options={topCategoryOptions}
            onChange={onCategoryChange}
          />
        </td>
        <td style={s.td}>
          {selectedTopCategory && selectedTopCategory.subCategories.length > 0 ? (
            <EditableStatusBadge
              status={subId}
              options={subCategoryOptions}
              onChange={(v) => onCategoryChange(v === "" ? topId : v)}
            />
          ) : (
            "—"
          )}
        </td>
        <td style={{ ...s.td, wordBreak: "break-word" }}>{row.linkedSummary ?? "—"}</td>
        <td style={s.td}>
          <button onClick={() => setLinkOpen((v) => !v)} style={s.iconBtn("#0f2342")}>
            🔗
          </button>
        </td>
        <td style={s.td}>
          <button onClick={onDelete} style={s.iconBtn("#991b1b")}>
            ✕
          </button>
        </td>
      </tr>
      {linkOpen && (
        <tr>
          <td colSpan={14} style={{ ...s.td, background: "#f8fafc" }}>
            {loadingLinks ? (
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>Loading links…</div>
            ) : existingLinks.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                {existingLinks.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 10px",
                      background: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ flex: 1, color: "#1a1a2e" }}>
                      {l.linkedEntityLabel}
                      {l.linkedAmount != null && ` — ${fmtMoney(l.linkedAmount)}`}
                    </span>
                    <button
                      onClick={() => removeLink(l.id)}
                      disabled={unlinkingId === l.id}
                      style={s.btn("#991b1b", unlinkingId === l.id)}
                    >
                      {unlinkingId === l.id ? "Removing…" : "Unlink"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>Not linked to anything yet.</div>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {(["Investment", "Redemption", "Distribution"] as LinkedEntityType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setLinkEntityType(t);
                      setSelectedCandidate(null);
                    }}
                    style={s.btn(linkEntityType === t ? "#0f2342" : "#cbd5e1")}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div style={{ flex: "1 1 260px", minWidth: 220 }}>
                <EntitySearchCombobox key={linkEntityType} entityType={linkEntityType} onSelect={setSelectedCandidate} />
              </div>
              <button
                onClick={addLink}
                disabled={!selectedCandidate || linking}
                style={s.btn("#b8923a", !selectedCandidate || linking)}
              >
                {linking ? "Linking…" : "Add Link"}
              </button>
              <button onClick={() => setLinkOpen(false)} style={s.btn("#64748b")}>
                Close
              </button>
            </div>
            {linkError && (
              <div style={{ color: "#991b1b", fontSize: 12, marginTop: 6 }}>{linkError}</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Add Transaction modal ────────────────────────────────────────────────

function AddTransactionModal({
  accounts,
  categories,
  onClose,
  onAdded,
}: {
  accounts: string[];
  categories: TransactionCategoryItem[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [accountNumber, setAccountNumber] = useState(accounts[0] ?? "");
  const [postDate, setPostDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!accountNumber.trim()) return setError("Account number is required.");
    if (!description.trim()) return setError("Description is required.");
    const amountNum = Number(amount);
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) return setError("Enter an amount greater than zero.");
    const balanceNum = Number(balance);
    if (balance === "" || Number.isNaN(balanceNum)) return setError("Bank Balance is required.");

    setSaving(true);
    try {
      const res = await bankTransactionsApi.create({
        accountNumber: accountNumber.trim(),
        postDate,
        checkNumber: checkNumber.trim() || undefined,
        description: description.trim(),
        debit: direction === "debit" ? amountNum : undefined,
        credit: direction === "credit" ? amountNum : undefined,
        balance: balanceNum,
        categoryId: categoryId ? Number(categoryId) : undefined,
      });
      if (res.success) onAdded();
      else setError(res.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: "white", borderRadius: 10, padding: 24, width: 480, maxWidth: "90vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0f2342", marginBottom: 16 }}>
          Add Transaction
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Account Number
            </label>
            <input
              type="text"
              list="known-accounts"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              style={{ padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }}
            />
            <datalist id="known-accounts">
              {accounts.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Date
            </label>
            <input
              type="date"
              value={postDate}
              onChange={(e) => setPostDate(e.target.value)}
              style={{ padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Check #
            </label>
            <input
              type="text"
              value={checkNumber}
              onChange={(e) => setCheckNumber(e.target.value)}
              style={{ padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Category (optional)
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              style={{ padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Direction
            </label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as "credit" | "debit")}
              style={{ padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }}
            >
              <option value="credit">Credit (in)</option>
              <option value="debit">Debit (out)</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Amount
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Bank Balance
            </label>
            <input
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              style={{ padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }}
            />
          </div>
        </div>

        {error && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 18px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: "#64748b", color: "#fff" }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              padding: "8px 18px", borderRadius: 6, border: "none",
              cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
              background: saving ? "#d1d5db" : "#b8923a", color: "#fff", opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Adding…" : "Add Transaction"}
          </button>
        </div>
      </div>
    </div>
  );
}
