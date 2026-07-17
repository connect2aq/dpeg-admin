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

  const saveAdminDescription = async (row: BankTransactionListItem, value: string) => {
    if (value === (row.adminDescription ?? "")) return;
    await bankTransactionsApi.update(row.id, { adminDescription: value });
    load();
  };

  const changeCategory = async (row: BankTransactionListItem, value: string) => {
    const categoryId = value === "" ? null : Number(value);
    await bankTransactionsApi.setCategory(row.id, categoryId);
    load();
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
