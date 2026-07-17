"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type BankTransactionBalanceFlow,
  type LinkCandidate,
  type LinkedEntityType,
  type PagedResult,
  type TransactionCategoryItem,
} from "@/lib/api";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import { formatShortDate } from "@/lib/dateFormat";

const DEFAULT_PAGE_SIZE = 25;

function fmtMoney(n?: number) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const [linkFilter, setLinkFilter] = useState<"" | "linked" | "unlinked">("");
  const [direction, setDirection] = useState<"" | "in" | "out">("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortOn, setSortOn] = useState("postdate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [activeTab, setActiveTab] = useState<"transactions" | "balance-flow">("transactions");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false);
  const [linkEntityType, setLinkEntityType] = useState<LinkedEntityType>("Investment");
  const [selectedCandidate, setSelectedCandidate] = useState<LinkCandidate | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");

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
      const res = await bankTransactionsApi.list({
        page,
        pageSize,
        from: from || undefined,
        to: to || undefined,
        categoryIds: categoryIds.includes("uncategorized")
          ? undefined
          : categoryIds.length
            ? categoryIds
            : undefined,
        uncategorizedOnly: categoryIds.includes("uncategorized") ? true : undefined,
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
  }, [page, pageSize, from, to, categoryIds, linkFilter, direction, search, sortOn, sortDirection]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    bankTransactionsApi.getCategories(false).then((res) => {
      if (res.success) setCategories(res.data);
    });
  }, []);

  const categoryOptions = [
    { value: "uncategorized", label: "Uncategorized" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];
  const categorySelectOptions = [
    { value: "", label: "Uncategorized" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadError("Please select a .csv file first.");
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
      const categoryName = categoryId == null ? undefined : categories.find((c) => c.id === categoryId)?.name;
      updateRowInPlace(row.id, { categoryId: categoryId ?? undefined, categoryName });
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

  const viewCategory = (value: string | null) => {
    setCategoryIds(value == null ? [] : [value]);
    setPage(1);
    setActiveTab("transactions");
  };

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
      } else setLinkError(res.message);
    } finally {
      setLinking(false);
    }
  };

  return (
    <AdminLayout>
      <div className="page-content">
        <h1 style={s.h1}>Bank Transactions</h1>
        <p style={s.sub}>
          Import the fund&apos;s bank account history, categorize each line, and
          tag transactions against the matching Investment, Redemption, or
          Distribution record. Only Posted transactions are imported — Pending
          rows are skipped until they post on a later export.
        </p>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid #e2e8f0" }}>
          {(
            [
              { key: "transactions", label: "Transactions" },
              { key: "balance-flow", label: "Balance Flow" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
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

        {activeTab === "transactions" && (
        <>
        {/* Upload */}
        <div style={s.card}>
          <div style={s.cardTitle}>Import Bank Statement (CSV)</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept=".csv" style={{ fontSize: 13, color: "#374151" }} />
            <button onClick={handleUpload} disabled={uploading} style={s.btn("#0f2342", uploading)}>
              {uploading ? "Importing…" : "⬆ Import"}
            </button>
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
                  <table style={s.table}>
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
            options={categoryOptions}
            selectedValues={categoryIds}
            onChange={(v) => {
              setCategoryIds(v);
              setPage(1);
            }}
            allLabel="All Categories"
            buttonLabel="Category"
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
            <option value="">Money In &amp; Out</option>
            <option value="in">Money In</option>
            <option value="out">Money Out</option>
          </select>
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setCategoryIds([]);
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
                      <th style={{ ...s.th, width: 30 }}>
                        <input
                          type="checkbox"
                          checked={selected.size === result.items.length && result.items.length > 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <SortableTh label="Date" sortKey="postdate" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={s.th} />
                      <th style={s.th}>Description</th>
                      <th style={s.th}>Notes</th>
                      <th style={s.th}>Check #</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Debit</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Credit</th>
                      <SortableTh label="Balance" sortKey="balance" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={{ ...s.th, textAlign: "right" }} />
                      <th style={s.th}>Category</th>
                      <th style={s.th}>Linked To</th>
                      <th style={s.th}>Link</th>
                      <th style={s.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((row) => (
                      <TransactionRow
                        key={row.id}
                        row={row}
                        checked={selected.has(row.id)}
                        onToggle={() => toggleSelect(row.id)}
                        categorySelectOptions={categorySelectOptions}
                        onSaveNotes={(v) => saveAdminDescription(row, v)}
                        onCategoryChange={(v) => changeCategory(row, v)}
                        onDelete={() => deleteRow(row)}
                        onReload={load}
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
        </>
        )}
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
    </AdminLayout>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────

function TransactionRow({
  row,
  checked,
  onToggle,
  categorySelectOptions,
  onSaveNotes,
  onCategoryChange,
  onDelete,
  onReload,
}: {
  row: BankTransactionListItem;
  checked: boolean;
  onToggle: () => void;
  categorySelectOptions: { value: string; label: string }[];
  onSaveNotes: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onDelete: () => void;
  onReload: () => void;
}) {
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
        <td style={{ ...s.td, maxWidth: 260 }} title={row.rawDescription}>
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
            style={{ ...s.input, padding: "4px 8px", fontSize: 12, width: 140 }}
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
        <td style={s.td}>
          <EditableStatusBadge
            status={row.categoryId != null ? String(row.categoryId) : ""}
            options={categorySelectOptions}
            onChange={onCategoryChange}
          />
        </td>
        <td style={{ ...s.td, fontSize: 12 }}>{row.linkedSummary ?? "—"}</td>
        <td style={s.td}>
          <button onClick={() => setLinkOpen((v) => !v)} style={s.btn("#0f2342")}>
            🔗
          </button>
        </td>
        <td style={s.td}>
          <button onClick={onDelete} style={s.btn("#991b1b")}>
            ✕
          </button>
        </td>
      </tr>
      {linkOpen && (
        <tr>
          <td colSpan={12} style={{ ...s.td, background: "#f8fafc" }}>
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

// ── Balance Flow tab ─────────────────────────────────────────────────────
// Mirrors the Dashboard's "Balance Flow" card visually, but every number here is
// derived purely from categorized bank transactions rather than manually-entered
// figures — so "Bank Account Balance" is the real running balance from the last
// imported statement row, and "Variance" is a genuine reconciliation check against
// however much of the fund's activity is still miscategorized or uncategorized.

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
  const signed = (n: number) => `${n < 0 ? "−" : ""}${fmt(n)}`;

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

  const investment = getCat("Investment");
  const redemption = getCat("Redemption");
  const distribution = getCat("Distribution");
  const deployed = getCat("Deployed");
  const dividendReceived = getCat("Dividend Received");
  const sponsoredEquity = getCat("Sponsored Equity");
  const profitFromBank = getCat("Profit Received from Bank");
  const otherCharges = getCat("Other Charges");

  const totalInvestment = investment?.total ?? 0;
  const totalRedemption = redemption?.total ?? 0;
  const totalDistribution = distribution?.total ?? 0;
  const totalDeployed = deployed?.total ?? 0;
  const totalDividendReceived = dividendReceived?.total ?? 0;
  const totalSponsoredEquity = sponsoredEquity?.total ?? 0;
  const totalProfitFromBank = profitFromBank?.total ?? 0;
  const totalOtherCharges = otherCharges?.total ?? 0;

  const balanceRemaining = totalInvestment + totalRedemption;
  const afterDistribution = balanceRemaining + totalDistribution;
  const totalBalanceAvailable =
    afterDistribution + totalDeployed + totalDividendReceived + totalSponsoredEquity + totalProfitFromBank + totalOtherCharges;

  const bankBalance = data.latestBankBalance;
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
          label: "Investment",
          value: investment && investment.count > 0 ? signed(totalInvestment) : "No transactions yet",
          accent: "#0e3416",
          muted: !investment || investment.count === 0,
          onClick: investment ? () => onViewCategory(String(investment.categoryId)) : undefined,
        })}
        {tile({
          label: "Redemption",
          value: redemption && redemption.count > 0 ? signed(totalRedemption) : "No transactions yet",
          accent: "#ef4444",
          arrow: true,
          muted: !redemption || redemption.count === 0,
          onClick: redemption ? () => onViewCategory(String(redemption.categoryId)) : undefined,
        })}
        {tile({ label: "Balance Remaining", value: signed(balanceRemaining), accent: "#6366f1" })}
        {tile({
          label: "Distribution Paid",
          value: distribution && distribution.count > 0 ? signed(totalDistribution) : "No transactions yet",
          accent: "#f59e0b",
          arrow: true,
          muted: !distribution || distribution.count === 0,
          onClick: distribution ? () => onViewCategory(String(distribution.categoryId)) : undefined,
        })}

        {tile({ label: "After Distributions", value: signed(afterDistribution), accent: "#10b981" })}
        {tile({
          label: "Deployed",
          value: deployed && deployed.count > 0 ? signed(totalDeployed) : "No transactions yet",
          accent: "#8b5cf6",
          arrow: true,
          muted: !deployed || deployed.count === 0,
          onClick: deployed ? () => onViewCategory(String(deployed.categoryId)) : undefined,
        })}
        {tile({
          label: "Dividend Received",
          value: dividendReceived && dividendReceived.count > 0 ? signed(totalDividendReceived) : "No transactions yet",
          accent: "#b8923a",
          muted: !dividendReceived || dividendReceived.count === 0,
          onClick: dividendReceived ? () => onViewCategory(String(dividendReceived.categoryId)) : undefined,
        })}
        {tile({
          label: "Sponsored Equity",
          value: sponsoredEquity && sponsoredEquity.count > 0 ? signed(totalSponsoredEquity) : "No transactions yet",
          accent: "#699172",
          muted: !sponsoredEquity || sponsoredEquity.count === 0,
          onClick: sponsoredEquity ? () => onViewCategory(String(sponsoredEquity.categoryId)) : undefined,
        })}

        {tile({
          label: "Profit Received from Bank",
          value: profitFromBank && profitFromBank.count > 0 ? signed(totalProfitFromBank) : "No transactions yet",
          accent: "#0f2342",
          muted: !profitFromBank || profitFromBank.count === 0,
          onClick: profitFromBank ? () => onViewCategory(String(profitFromBank.categoryId)) : undefined,
        })}
        {tile({
          label: "Other Charges / Expenses",
          value: otherCharges && otherCharges.count > 0 ? signed(totalOtherCharges) : "No transactions yet",
          accent: "#ef4444",
          arrow: true,
          muted: !otherCharges || otherCharges.count === 0,
          onClick: otherCharges ? () => onViewCategory(String(otherCharges.categoryId)) : undefined,
        })}
        {tile({ label: "Total Balance Available", value: signed(totalBalanceAvailable), accent: "#699172" })}
        {variance != null
          ? tile({
              label: "Variance",
              value: `${variance >= 0 ? "+" : "−"}${fmt(Math.abs(variance))}`,
              accent: variance >= 0 ? "#10b981" : "#ef4444",
              arrow: true,
            })
          : tile({ label: "Variance", value: "N/A", accent: "#94a3b8", arrow: true, muted: true })}

        {/* Bank Account Balance — full width, from the latest imported Posted transaction's own Balance field */}
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
            Bank Account Balance (Latest Imported Statement Row)
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
            ⚠ {data.uncategorizedCount} transaction(s) totaling {signed(data.uncategorizedTotal)} are still
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
