"use client";
import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { PaginationControls } from "@/components/PaginationControls";
import { SortableTh } from "@/components/SortableTh";
import {
  adminApi,
  type DailyInterestAuditItem,
  type DailyInterestItem,
  type DailyInterestPagedResult,
  type DeleteDailyInterestPreviewResult,
  type PagedResult,
  type ResetMonthResult,
  type ZeroLogIncludeFixResult,
} from "@/lib/api";
import { downloadCsv } from "@/lib/exportCsv";
import { hasMultiFilterValue } from "@/lib/filterUtils";
import type { QueryParams } from "@/lib/apiContracts";
import { formatShortDate } from "@/lib/dateFormat";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import Link from "next/link";

const DEFAULT_PAGE_SIZE = 25;

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

type DeleteModalState =
  | { phase: "idle" }
  | { phase: "loading" }
  | {
      phase: "confirm";
      preview: DeleteDailyInterestPreviewResult;
      ids: number[];
    }
  | { phase: "deleting" }
  | { phase: "done"; deleted: number; cascaded: number; skipped: number };

type ResetMonthModalState =
  | { phase: "idle" }
  | {
      phase: "confirm";
      applicationId: number;
      year: number;
      month: number;
      investorName: string;
    }
  | { phase: "resetting" }
  | { phase: "done"; result: ResetMonthResult };

export default function DailyInterestPage() {
  const [activeTab, setActiveTab] = useState<"logs" | "audit">("logs");
  const [auditLogIdFilter, setAuditLogIdFilter] = useState<number | null>(
    null,
  );
  const viewHistory = (logId: number) => {
    setAuditLogIdFilter(logId);
    setActiveTab("audit");
  };

  const [result, setResult] = useState<DailyInterestPagedResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [appId, setAppId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [included, setIncluded] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortOn, setSortOn] = useState("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const toggleSort = (key: string) => {
    if (sortOn === key) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortOn(key);
      setSortDirection("asc");
    }
    setPage(1);
  };
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [diBulkPushing, setDiBulkPushing] = useState(false);
  const [diBulkResult, setDiBulkResult] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    phase: "idle",
  });
  const [resetModal, setResetModal] = useState<ResetMonthModalState>({
    phase: "idle",
  });
  const [exporting, setExporting] = useState(false);

  // Backfill missing daily interest (bulk catch-up)
  const [catchUpFrom, setCatchUpFrom] = useState(firstOfMonthStr());
  const [catchUpTo, setCatchUpTo] = useState(yesterdayStr());
  const [catchUpLoading, setCatchUpLoading] = useState(false);
  const [catchUpResult, setCatchUpResult] = useState<{
    appsProcessed: number;
    logsCreated: number;
    errors: string[];
  } | null>(null);
  const [catchUpError, setCatchUpError] = useState<string | null>(null);

  const handleCatchUp = async () => {
    setCatchUpLoading(true);
    setCatchUpResult(null);
    setCatchUpError(null);
    const r = await adminApi.runBulkCatchUp(catchUpFrom, catchUpTo);
    setCatchUpLoading(false);
    if (r.success) setCatchUpResult(r.data);
    else
      setCatchUpError("Catch-up failed. Check the date range and try again.");
  };

  // Mark zero-value ("Pending" forever) logs as distribution-complete
  const [zeroFixLoading, setZeroFixLoading] = useState(false);
  const [zeroFixPreview, setZeroFixPreview] =
    useState<ZeroLogIncludeFixResult | null>(null);
  const [zeroFixError, setZeroFixError] = useState<string | null>(null);
  const [zeroFixApplying, setZeroFixApplying] = useState(false);
  const [zeroFixApplied, setZeroFixApplied] =
    useState<ZeroLogIncludeFixResult | null>(null);
  const [zeroFixConfirmOpen, setZeroFixConfirmOpen] = useState(false);

  const handleZeroFixPreview = async () => {
    setZeroFixLoading(true);
    setZeroFixError(null);
    setZeroFixPreview(null);
    setZeroFixApplied(null);
    const r = await adminApi.markZeroLogsIncluded(true);
    setZeroFixLoading(false);
    if (r.success) setZeroFixPreview(r.data);
    else setZeroFixError("Preview failed. Try again or check server logs.");
  };

  const handleZeroFixApply = async () => {
    setZeroFixConfirmOpen(false);
    setZeroFixApplying(true);
    const r = await adminApi.markZeroLogsIncluded(false);
    setZeroFixApplying(false);
    if (r.success) {
      setZeroFixApplied(r.data);
      setZeroFixPreview(null);
      load();
    } else {
      setZeroFixError("Apply failed. Try again or check server logs.");
    }
  };

  const exportToExcel = async () => {
    setExporting(true);
    const params: QueryParams = {
      page: 1,
      pageSize: 100000,
    };
    if (appId) params.appId = appId;
    if (from) params.from = from;
    if (to) params.to = to;
    if (included.length === 1) params.included = included[0];
    const r = await adminApi.dailyInterestLogs(params);
    if (r.success) {
      const headers = [
        "ID",
        "App ID",
        "Account User",
        "Investor Name",
        "Email",
        "Date",
        "Units",
        "Capital",
        "Annual Rate %",
        "Net Interest",
        "Included in Monthly",
        "Odoo Status",
        "Created",
      ];
      const rows = r.data.items.map((d) => [
        d.id,
        d.applicationId,
        d.userName ?? "",
        d.investorName,
        d.userEmail ?? "",
        formatShortDate(d.date),
        d.units,
        d.capital,
        d.annualRate,
        d.netInterest,
        d.includedInMonthlyDistribution ? "Yes" : "No",
        d.odooStatus ?? "",
        formatShortDate(d.createdOn),
      ]);
      downloadCsv([headers, ...rows], "daily-interest.csv");
    }
    setExporting(false);
  };

  const load = useCallback(() => {
    setLoading(true);
    const params: QueryParams = {
      page,
      pageSize,
      sortOn,
      sortDirection,
    };
    if (appId) params.appId = appId;
    if (from) params.from = from;
    if (to) params.to = to;
    if (included.length === 1) params.included = included[0];
    setSelectedIds(new Set());
    adminApi
      .dailyInterestLogs(params)
      .then((r) => {
        if (r.success) setResult(r.data);
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, appId, from, to, included, sortOn, sortDirection]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBulkPushDailyInterest = async () => {
    const ids = [...selectedIds];
    setDiBulkPushing(true);
    setDiBulkResult(null);
    const r = await adminApi.bulkPushDailyInterestToOdoo(ids);
    setDiBulkPushing(false);
    if (r.success) {
      setDiBulkResult(
        `Pushed ${r.data.pushed} record${r.data.pushed !== 1 ? "s" : ""}${r.data.failed > 0 ? `, ${r.data.failed} failed` : ""}.`,
      );
      setSelectedIds(new Set());
      load();
    }
  };

  const handleDeleteClick = async () => {
    const ids = [...selectedIds];
    setDeleteModal({ phase: "loading" });
    const r = await adminApi.previewDeleteDailyInterest(ids);
    if (r.success) {
      setDeleteModal({ phase: "confirm", preview: r.data, ids });
    } else {
      setDeleteModal({ phase: "idle" });
    }
  };

  const handleDeleteConfirm = async (cascadeMonthly: boolean) => {
    const modal = deleteModal;
    if (modal.phase !== "confirm") return;
    setDeleteModal({ phase: "deleting" });
    const r = await adminApi.batchDeleteDailyInterest(
      modal.ids,
      cascadeMonthly,
    );
    if (r.success) {
      setDeleteModal({
        phase: "done",
        deleted: r.data.deleted,
        cascaded: r.data.cascadedDistributions,
        skipped: r.data.skipped,
      });
      setSelectedIds(new Set());
      load();
    } else {
      setDeleteModal({ phase: "idle" });
    }
  };

  const handleResetMonth = (row: DailyInterestItem) => {
    const d = new Date(row.date);
    setResetModal({
      phase: "confirm",
      applicationId: row.applicationId,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      investorName: row.investorName,
    });
  };

  const handleResetConfirm = async () => {
    if (resetModal.phase !== "confirm") return;
    const { applicationId, year, month } = resetModal;
    setResetModal({ phase: "resetting" });
    const r = await adminApi.resetMonthDistribution(applicationId, year, month);
    if (r.success) {
      setResetModal({ phase: "done", result: r.data });
      load();
    } else {
      setResetModal({ phase: "idle" });
    }
  };

  const totalPages = result ? Math.ceil(result.totalCount / pageSize) : 1;
  const totalInterest =
    result?.items.reduce((s, i) => s + i.netInterest, 0) ?? 0;

  const th: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    borderBottom: "2px solid #e2e8f0",
    background: "#f8fafc",
    textAlign: "left",
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: 13,
    color: "#374151",
    borderBottom: "1px solid #f1f5f9",
  };

  const allPageIds = (result?.items ?? []).map((r) => r.id);
  const allSelected =
    allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id));

  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px" }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#0e3416",
            marginBottom: 6,
          }}
        >
          Daily Interest Logs
        </h1>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
          Daily interest accrual records per investor application.
        </p>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid #e2e8f0" }}>
          {(
            [
              { key: "logs", label: "Daily Interest Logs" },
              { key: "audit", label: "Audit History" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key);
                if (t.key === "logs") setAuditLogIdFilter(null);
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

        {activeTab === "audit" && (
          <DailyInterestAuditTab
            initialLogId={auditLogIdFilter}
            onClearLogFilter={() => setAuditLogIdFilter(null)}
          />
        )}

        {activeTab === "logs" && (
        <>
        {/* Backfill missing daily interest (bulk catch-up) */}
        <div
          style={{
            background: "#fefce8",
            border: "1.5px solid #fde68a",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#92400e",
              marginBottom: 10,
            }}
          >
            Backfill Missing Daily Interest
          </div>
          <div style={{ fontSize: 13, color: "#78350f", marginBottom: 14 }}>
            Run this if daily interest logs are missing for a date range
            (e.g. newly activated investors). Creates logs for all active
            investors where no log exists yet, and sends each one to Odoo.
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label style={{ fontSize: 13, color: "#78350f", fontWeight: 500 }}>
              From
            </label>
            <input
              type="date"
              value={catchUpFrom}
              onChange={(e) => {
                setCatchUpFrom(e.target.value);
                setCatchUpResult(null);
              }}
              style={{
                padding: "9px 12px",
                border: "1.5px solid #fde68a",
                borderRadius: 8,
                fontSize: 14,
                background: "#fffbeb",
              }}
            />
            <label style={{ fontSize: 13, color: "#78350f", fontWeight: 500 }}>
              To
            </label>
            <input
              type="date"
              value={catchUpTo}
              onChange={(e) => {
                setCatchUpTo(e.target.value);
                setCatchUpResult(null);
              }}
              style={{
                padding: "9px 12px",
                border: "1.5px solid #fde68a",
                borderRadius: 8,
                fontSize: 14,
                background: "#fffbeb",
              }}
            />
            <button
              onClick={handleCatchUp}
              disabled={catchUpLoading}
              style={{
                padding: "9px 20px",
                background: "#b45309",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: catchUpLoading ? "not-allowed" : "pointer",
                opacity: catchUpLoading ? 0.6 : 1,
              }}
            >
              {catchUpLoading ? "Running…" : "Run Catch-Up"}
            </button>
          </div>
          {catchUpError && (
            <div style={{ marginTop: 10, fontSize: 13, color: "#dc2626" }}>
              {catchUpError}
            </div>
          )}
          {catchUpResult && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  padding: "8px 14px",
                  background: "#f0fdf4",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#15803d",
                  fontWeight: 500,
                  display: "inline-block",
                }}
              >
                ✓ Catch-up complete — {catchUpResult.appsProcessed} investor
                {catchUpResult.appsProcessed !== 1 ? "s" : ""} updated,{" "}
                {catchUpResult.logsCreated} new log
                {catchUpResult.logsCreated !== 1 ? "s" : ""} created.
                {catchUpResult.logsCreated > 0 &&
                  " Now go to Manage Distribution to preview updated amounts."}
              </div>
              {catchUpResult.errors?.length > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "12px 16px",
                    background: "#fef9c3",
                    border: "1.5px solid #fbbf24",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#92400e",
                      marginBottom: 6,
                    }}
                  >
                    ⚠ {catchUpResult.errors.length} redemption
                    {catchUpResult.errors.length !== 1 ? "s" : ""} skipped —
                    EffectiveDate missing or invalid. Fix these records
                    manually:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {catchUpResult.errors.map((e, i) => (
                      <li
                        key={i}
                        style={{
                          fontSize: 12,
                          color: "#78350f",
                          marginBottom: 2,
                          fontFamily: "monospace",
                        }}
                      >
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fix: zero-value logs stuck as "Pending" */}
        <div
          style={{
            background: "#ecfdf5",
            border: "1.5px solid #a7f3d0",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#065f46",
              marginBottom: 10,
            }}
          >
            Mark Zero-Value Logs as Distribution-Complete
          </div>
          <div style={{ fontSize: 13, color: "#065f46", marginBottom: 14 }}>
            Rows correctly trimmed to $0 (fully redeemed, interest already
            paid via the redemption&rsquo;s prorated preferred return) will
            never get picked up by the monthly distribution job — it skips
            any application/month that ends at 0 units. This only flips the
            &ldquo;Distributed&rdquo; flag on rows that are already exactly
            Units=0, Capital=$0, Net Interest=$0 and not yet marked
            included. It never changes a dollar amount.
          </div>
          <button
            onClick={handleZeroFixPreview}
            disabled={zeroFixLoading}
            style={{
              padding: "9px 18px",
              background: "#059669",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: zeroFixLoading ? "not-allowed" : "pointer",
              opacity: zeroFixLoading ? 0.6 : 1,
            }}
          >
            {zeroFixLoading ? "Checking…" : "Preview"}
          </button>
          {zeroFixError && (
            <div style={{ fontSize: 13, color: "#dc2626", marginTop: 10 }}>
              {zeroFixError}
            </div>
          )}
          {zeroFixPreview && (
            <div style={{ marginTop: 14 }}>
              {zeroFixPreview.totalMatched === 0 ? (
                <div
                  style={{
                    padding: "8px 14px",
                    background: "#f0fdf4",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#15803d",
                    fontWeight: 500,
                    display: "inline-block",
                  }}
                >
                  ✓ No zero-value logs are stuck as Pending.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#065f46",
                      marginBottom: 8,
                    }}
                  >
                    Found {zeroFixPreview.totalMatched} zero-value log
                    {zeroFixPreview.totalMatched !== 1 ? "s" : ""} across{" "}
                    {zeroFixPreview.distinctApplications} application
                    {zeroFixPreview.distinctApplications !== 1 ? "s" : ""}{" "}
                    still marked Pending.
                  </div>
                  <div style={{ overflowX: "auto", marginBottom: 12 }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 12,
                      }}
                    >
                      <thead>
                        <tr>
                          {["App ID", "Count", "Earliest Date", "Latest Date"].map(
                            (h) => (
                              <th
                                key={h}
                                style={{
                                  textAlign: "left",
                                  padding: "6px 10px",
                                  background: "#d1fae5",
                                  color: "#065f46",
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {zeroFixPreview.apps.map((a) => (
                          <tr key={a.applicationId}>
                            <td
                              style={{
                                padding: "6px 10px",
                                borderBottom: "1px solid #d1fae5",
                              }}
                            >
                              <Link
                                href={`/applications/${a.applicationId}`}
                                style={{
                                  color: "#6d28d9",
                                  fontWeight: 600,
                                  textDecoration: "underline",
                                }}
                              >
                                #{a.applicationId}
                              </Link>
                            </td>
                            <td
                              style={{
                                padding: "6px 10px",
                                borderBottom: "1px solid #d1fae5",
                              }}
                            >
                              {a.count}
                            </td>
                            <td
                              style={{
                                padding: "6px 10px",
                                borderBottom: "1px solid #d1fae5",
                              }}
                            >
                              {formatShortDate(a.minDate)}
                            </td>
                            <td
                              style={{
                                padding: "6px 10px",
                                borderBottom: "1px solid #d1fae5",
                              }}
                            >
                              {formatShortDate(a.maxDate)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={() => setZeroFixConfirmOpen(true)}
                    disabled={zeroFixApplying}
                    style={{
                      padding: "9px 18px",
                      background: "#059669",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: zeroFixApplying ? "not-allowed" : "pointer",
                      opacity: zeroFixApplying ? 0.6 : 1,
                    }}
                  >
                    {zeroFixApplying
                      ? "Applying…"
                      : `Mark All ${zeroFixPreview.totalMatched} as Distribution-Complete`}
                  </button>
                </>
              )}
            </div>
          )}
          {zeroFixApplied && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 8,
                fontSize: 13,
                color: "#15803d",
                fontWeight: 600,
              }}
            >
              ✓ Marked {zeroFixApplied.totalMatched} log
              {zeroFixApplied.totalMatched !== 1 ? "s" : ""} across{" "}
              {zeroFixApplied.distinctApplications} application
              {zeroFixApplied.distinctApplications !== 1 ? "s" : ""} as
              distribution-complete.
            </div>
          )}
        </div>

        {/* Zero-value fix confirmation modal */}
        {zeroFixConfirmOpen && zeroFixPreview && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: 32,
                width: 520,
                maxWidth: "95vw",
                boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              }}
            >
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#0f2342",
                  marginBottom: 6,
                }}
              >
                Mark {zeroFixPreview.totalMatched} logs as distribution-complete?
              </h2>
              <div
                style={{
                  padding: "12px 14px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#065f46",
                  margin: "16px 0 20px",
                }}
              >
                This only sets the &ldquo;Distributed&rdquo; flag to true on
                rows that are already exactly $0 across{" "}
                {zeroFixPreview.distinctApplications} application
                {zeroFixPreview.distinctApplications !== 1 ? "s" : ""}. No
                unit count, capital, or interest value is changed on any row.
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => setZeroFixConfirmOpen(false)}
                  style={{
                    padding: "9px 18px",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: 8,
                    fontSize: 13,
                    cursor: "pointer",
                    background: "#fff",
                    color: "#374151",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleZeroFixApply}
                  style={{
                    padding: "9px 18px",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: "#059669",
                    color: "#fff",
                  }}
                >
                  Mark as Complete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <input
            type="number"
            placeholder="Application ID"
            value={appId}
            onChange={(e) => {
              setAppId(e.target.value);
              setPage(1);
            }}
            style={{
              padding: "9px 12px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 13,
              width: 150,
            }}
          />
          <input
            type="date"
            value={from}
            onChange={(e) => {
              const nextFrom = e.target.value;
              setFrom(nextFrom);
              if (to && nextFrom && to < nextFrom) setTo(nextFrom);
              setPage(1);
            }}
            max={to || undefined}
            style={{
              padding: "9px 12px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <input
            type="date"
            value={to}
            onChange={(e) => {
              const nextTo = e.target.value;
              setTo(nextTo);
              if (from && nextTo && from > nextTo) setFrom(nextTo);
              setPage(1);
            }}
            min={from || undefined}
            style={{
              padding: "9px 12px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <MultiSelectFilter
            allLabel="All Records"
            buttonLabel="Included"
            options={[
              { value: "true", label: "Included in Distribution" },
              { value: "false", label: "Pending Distribution" },
            ]}
            selectedValues={included}
            onChange={(next) => {
              setIncluded(next);
              setPage(1);
            }}
            minWidth={220}
          />
          <button
            onClick={exportToExcel}
            disabled={exporting}
            style={{
              padding: "9px 18px",
              background: "#10b981",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: exporting ? "not-allowed" : "pointer",
              opacity: exporting ? 0.7 : 1,
            }}
          >
            {exporting ? "Exporting…" : "↓ Export"}
          </button>
          {(appId || from || to || hasMultiFilterValue(included)) && (
            <button
              onClick={() => {
                setAppId("");
                setFrom("");
                setTo("");
                setIncluded([]);
                setPage(1);
                setSelectedIds(new Set());
              }}
              style={{
                padding: "9px 14px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 13,
                background: "white",
                color: "#475569",
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          )}
        </div>

        {/* Summary bar */}
        {result && result.totalCount > 0 && (
          <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
            {[
              {
                label: "Records (this page)",
                value: result.items.length.toString(),
              },
              {
                label: "Interest (this page)",
                value: `$${totalInterest.toFixed(2)}`,
              },
              { label: "Total Records", value: result.totalCount.toString() },
              {
                label: "Net Interest (all filtered rows)",
                value: `$${result.totalNetInterest.toFixed(2)}`,
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "10px 18px",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "#94a3b8",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 2,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{ fontSize: 18, fontWeight: 700, color: "#0e3416" }}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 12,
              padding: "10px 16px",
              background: "#f0f9ff",
              border: "1.5px solid #bae6fd",
              borderRadius: 10,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "#0369a1" }}>
              {selectedIds.size} selected
            </span>
            <button
              onClick={handleBulkPushDailyInterest}
              disabled={diBulkPushing}
              style={{
                padding: "7px 16px",
                background: "#b8923a",
                color: "#fff",
                border: "none",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                opacity: diBulkPushing ? 0.6 : 1,
              }}
            >
              {diBulkPushing
                ? "Pushing…"
                : `Push to Odoo (${selectedIds.size})`}
            </button>
            <button
              onClick={handleDeleteClick}
              disabled={
                deleteModal.phase === "loading" ||
                deleteModal.phase === "deleting"
              }
              style={{
                padding: "7px 16px",
                background: "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                opacity:
                  deleteModal.phase === "loading" ||
                  deleteModal.phase === "deleting"
                    ? 0.6
                    : 1,
              }}
            >
              {deleteModal.phase === "loading"
                ? "Checking…"
                : `Delete (${selectedIds.size})`}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{
                marginLeft: "auto",
                padding: "4px 10px",
                background: "none",
                border: "1px solid #94a3b8",
                borderRadius: 6,
                fontSize: 12,
                cursor: "pointer",
                color: "#64748b",
              }}
            >
              Clear
            </button>
          </div>
        )}

        {diBulkResult && (
          <div
            style={{
              marginBottom: 10,
              padding: "8px 14px",
              background: "#f0fdf4",
              borderRadius: 8,
              fontSize: 13,
              color: "#15803d",
              fontWeight: 500,
            }}
          >
            ✓ {diBulkResult}
          </div>
        )}

        {/* Delete result banner */}
        {deleteModal.phase === "done" && (
          <div
            style={{
              marginBottom: 10,
              padding: "10px 16px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 8,
              fontSize: 13,
              color: "#15803d",
              fontWeight: 500,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              ✓ Deleted {deleteModal.deleted} record
              {deleteModal.deleted !== 1 ? "s" : ""}.
              {deleteModal.cascaded > 0 &&
                ` Cascade-deleted ${deleteModal.cascaded} monthly distribution log${deleteModal.cascaded !== 1 ? "s" : ""}.`}
              {deleteModal.skipped > 0 &&
                ` ${deleteModal.skipped} record${deleteModal.skipped !== 1 ? "s" : ""} skipped (already in monthly distribution).`}{" "}
              Run Catch-Up to regenerate deleted records.
            </span>
            <button
              onClick={() => setDeleteModal({ phase: "idle" })}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                color: "#15803d",
                marginLeft: 12,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Reset month result banner */}
        {resetModal.phase === "done" && (
          <div
            style={{
              marginBottom: 10,
              padding: "10px 16px",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: 8,
              fontSize: 13,
              color: "#9a3412",
              fontWeight: 500,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              ✓ Reset complete — {resetModal.result.logsReset} daily log
              {resetModal.result.logsReset !== 1 ? "s" : ""} unmarked.
              {resetModal.result.distributionDeleted &&
                ` Monthly distribution record deleted (was $${resetModal.result.previousAmount.toFixed(2)}${resetModal.result.odooStatus ? `, Odoo: ${resetModal.result.odooStatus}` : ""}).`}{" "}
              Re-run Distribution Execute to include these logs in the corrected
              payout.
            </span>
            <button
              onClick={() => setResetModal({ phase: "idle" })}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                color: "#9a3412",
                marginLeft: 12,
              }}
            >
              ×
            </button>
          </div>
        )}

        {loading ? (
          <p style={{ color: "#64748b", fontSize: 14 }}>Loading…</p>
        ) : (
          <>
            <div className="table-scroll">
              <table style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => {
                          if (e.target.checked)
                            setSelectedIds(new Set(allPageIds));
                          else setSelectedIds(new Set());
                        }}
                      />
                    </th>
                    <SortableTh
                      label="App ID"
                      sortKey="appid"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Date"
                      sortKey="date"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <th>Type</th>
                    <SortableTh
                      label="Account User"
                      sortKey="accountuser"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Investor"
                      sortKey="investor"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Units"
                      sortKey="units"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Capital"
                      sortKey="capital"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Rate"
                      sortKey="rate"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Net Interest"
                      sortKey="netinterest"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Distributed"
                      sortKey="distributed"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <th>History</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={12}
                        style={{
                          ...td,
                          textAlign: "center",
                          color: "#9ca3af",
                          padding: 32,
                        }}
                      >
                        No records found
                      </td>
                    </tr>
                  )}
                  {result?.items.map((row) => {
                    const isSelected = selectedIds.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        style={{
                          background: isSelected
                            ? "#eff6ff"
                            : row.includedInMonthlyDistribution
                              ? "#f8fafc"
                              : undefined,
                        }}
                      >
                        <td style={{ ...td, textAlign: "center", width: 40 }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) =>
                              setSelectedIds((prev) => {
                                const s = new Set(prev);
                                if (e.target.checked) s.add(row.id);
                                else s.delete(row.id);
                                return s;
                              })
                            }
                          />
                        </td>
                        <td
                          style={{ padding: "11px 16px", whiteSpace: "nowrap" }}
                        >
                          {row.applicationId ? (
                            <Link
                              href={`/applications/${row.applicationId}`}
                              style={{
                                color: "#b8923a",
                                textDecoration: "underline",
                                fontWeight: 600,
                                fontSize: 12,
                              }}
                            >
                              #{row.applicationId}
                            </Link>
                          ) : (
                            <span style={{ color: "#cbd5e1", fontSize: 12 }}>
                              —
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            ...td,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatShortDate(row.date)}
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background:
                                row.recordType === "Adjustment"
                                  ? "#fef2f2"
                                  : "#f1f5f9",
                              color:
                                row.recordType === "Adjustment"
                                  ? "#b91c1c"
                                  : "#475569",
                            }}
                          >
                            {row.recordType === "Adjustment"
                              ? "Adjustment"
                              : "Nightly"}
                          </span>
                          {row.recordType === "Adjustment" &&
                            row.adjustmentReason && (
                              <div
                                style={{ fontSize: 10, color: "#9ca3af" }}
                                title={row.adjustmentReason}
                              >
                                {row.adjustmentReason}
                              </div>
                            )}
                        </td>
                        <td style={td}>
                          <Link
                            href={`/investor-statements?userId=${row.userId}`}
                            style={{
                              fontWeight: 600,
                              color: "#1e293b",
                              textDecoration: "underline",
                            }}
                            title="Open Investor Statement"
                          >
                            {row.userName || "—"}
                          </Link>
                          {row.userEmail && (
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>
                              {row.userEmail}
                            </div>
                          )}
                        </td>
                        <td style={td}>
                          <div style={{ fontWeight: 500 }}>
                            {row.investorName}
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          {row.units}
                        </td>
                        <td style={td}>${row.capital.toLocaleString()}</td>
                        <td style={{ ...td, color: "#6b7280" }}>
                          {(row.annualRate * 100).toFixed(0)}%
                        </td>
                        <td
                          style={{ ...td, fontWeight: 700, color: "#0e3416" }}
                        >
                          ${row.netInterest.toFixed(4)}
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: row.includedInMonthlyDistribution
                                ? "#f0fdf4"
                                : "#fef9c3",
                              color: row.includedInMonthlyDistribution
                                ? "#15803d"
                                : "#854d0e",
                            }}
                          >
                            {row.includedInMonthlyDistribution
                              ? "Yes"
                              : "Pending"}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => viewHistory(row.id)}
                            style={{
                              padding: "3px 10px",
                              background: "#f5f3ff",
                              border: "1px solid #ddd6fe",
                              borderRadius: 5,
                              fontSize: 11,
                              fontWeight: 600,
                              color: "#6d28d9",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            History
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <PaginationControls
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={(next) => {
                setPage(1);
                setPageSize(next);
              }}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              containerStyle={{ justifyContent: "center", marginTop: 20 }}
              buttonStyle={{
                padding: "6px 14px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                fontSize: 13,
              }}
              inputStyle={{ width: 64, padding: "6px 8px" }}
            />
            <p style={{ marginTop: 10, fontSize: 13, color: "#94a3b8" }}>
              {result?.totalCount ?? 0} total record
              {result?.totalCount !== 1 ? "s" : ""}
            </p>
          </>
        )}
        </>
        )}
      </div>

      {/* Reset Month confirmation modal */}
      {activeTab === "logs" && (resetModal.phase === "confirm" || resetModal.phase === "resetting") && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 32,
              width: 500,
              maxWidth: "95vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#0f2342",
                marginBottom: 6,
              }}
            >
              Reset Monthly Distribution
            </h2>

            {resetModal.phase === "confirm" &&
              (() => {
                const monthLabel = formatShortDate(
                  new Date(resetModal.year, resetModal.month - 1, 1),
                );
                return (
                  <>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        marginBottom: 20,
                      }}
                    >
                      <div
                        style={{
                          padding: "12px 14px",
                          background: "#fff7ed",
                          border: "1px solid #fed7aa",
                          borderRadius: 8,
                          fontSize: 13,
                          color: "#9a3412",
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>
                          {resetModal.investorName} — App #
                          {resetModal.applicationId} — {monthLabel}
                        </div>
                        <div>This will:</div>
                        <ul style={{ margin: "6px 0 0 18px", lineHeight: 1.7 }}>
                          <li>
                            Delete the <strong>{monthLabel}</strong> monthly
                            distribution record for this investor
                          </li>
                          <li>
                            Reset all daily interest logs for this month to{" "}
                            <strong>Pending</strong>
                          </li>
                        </ul>
                      </div>
                      <div
                        style={{
                          padding: "10px 14px",
                          background: "#f0f9ff",
                          border: "1px solid #bae6fd",
                          borderRadius: 8,
                          fontSize: 12,
                          color: "#075985",
                        }}
                      >
                        After resetting, go to the{" "}
                        <strong>Distributions</strong> page and re-run{" "}
                        <strong>Execute</strong> for this month to create a
                        corrected distribution that includes all daily logs
                        (including any newly catch-upped ones).
                      </div>
                      <div
                        style={{
                          padding: "10px 14px",
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          borderRadius: 8,
                          fontSize: 12,
                          color: "#991b1b",
                        }}
                      >
                        If this distribution was already pushed to Odoo, you
                        will need to correct that entry in Odoo separately.
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={() => setResetModal({ phase: "idle" })}
                        style={{
                          padding: "9px 18px",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: 8,
                          fontSize: 13,
                          cursor: "pointer",
                          background: "#fff",
                          color: "#374151",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleResetConfirm}
                        style={{
                          padding: "9px 18px",
                          border: "none",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          background: "#f97316",
                          color: "#fff",
                        }}
                      >
                        Reset & Unmark
                      </button>
                    </div>
                  </>
                );
              })()}

            {resetModal.phase === "resetting" && (
              <p style={{ color: "#64748b", fontSize: 14 }}>
                Resetting distribution…
              </p>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {activeTab === "logs" && (deleteModal.phase === "confirm" ||
        deleteModal.phase === "deleting") && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 32,
              width: 520,
              maxWidth: "95vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#0f2342",
                marginBottom: 6,
              }}
            >
              Confirm Delete
            </h2>

            {deleteModal.phase === "confirm" &&
              (() => {
                const { preview } = deleteModal;
                const hasConflict = preview.conflictedCount > 0;
                return (
                  <>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        marginBottom: 20,
                      }}
                    >
                      <div
                        style={{
                          padding: "10px 14px",
                          background: "#f0fdf4",
                          borderRadius: 8,
                          fontSize: 13,
                          color: "#15803d",
                        }}
                      >
                        <strong>{preview.safeCount}</strong> record
                        {preview.safeCount !== 1 ? "s" : ""} can be deleted
                        cleanly (not in any monthly distribution).
                      </div>

                      {hasConflict && (
                        <div
                          style={{
                            padding: "12px 14px",
                            background: "#fef2f2",
                            border: "1px solid #fecaca",
                            borderRadius: 8,
                            fontSize: 13,
                            color: "#991b1b",
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>
                            {preview.conflictedCount} record
                            {preview.conflictedCount !== 1 ? "s" : ""} already
                            included in monthly distributions.
                          </div>
                          <div style={{ marginBottom: 8, color: "#b91c1c" }}>
                            Deleting these will cascade-delete the following
                            monthly distribution log
                            {preview.affectedDistributions.length !== 1
                              ? "s"
                              : ""}{" "}
                            and reset all daily logs in those months — they will
                            need to be reprocessed.
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            {preview.affectedDistributions.map((d) => (
                              <div
                                key={d.distributionLogId}
                                style={{
                                  background: "#fff",
                                  border: "1px solid #fecaca",
                                  borderRadius: 6,
                                  padding: "8px 12px",
                                  fontSize: 12,
                                }}
                              >
                                <div
                                  style={{ fontWeight: 600, color: "#0f2342" }}
                                >
                                  {d.investorName} — App #{d.applicationId}
                                </div>
                                <div style={{ color: "#6b7280", marginTop: 2 }}>
                                  Month:{" "}
                                  <strong>
                                    {formatShortDate(d.distributionMonth)}
                                  </strong>
                                  {" · "}Amount:{" "}
                                  <strong>
                                    ${d.totalNetAmount.toFixed(2)}
                                  </strong>
                                  {" · "}
                                  {d.siblingLogsCount} daily log
                                  {d.siblingLogsCount !== 1 ? "s" : ""} will be
                                  reset
                                </div>
                                <div
                                  style={{
                                    marginTop: 4,
                                    display: "flex",
                                    gap: 6,
                                  }}
                                >
                                  {d.odooStatus && (
                                    <span
                                      style={{
                                        padding: "1px 7px",
                                        borderRadius: 4,
                                        fontSize: 10,
                                        fontWeight: 600,
                                        background:
                                          d.odooStatus === "Sent"
                                            ? "#fef9c3"
                                            : "#f1f5f9",
                                        color:
                                          d.odooStatus === "Sent"
                                            ? "#854d0e"
                                            : "#475569",
                                      }}
                                    >
                                      Odoo: {d.odooStatus}
                                    </span>
                                  )}
                                  <span
                                    style={{
                                      padding: "1px 7px",
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 600,
                                      background: "#f1f5f9",
                                      color: "#475569",
                                    }}
                                  >
                                    {d.paymentStatus}
                                  </span>
                                  {d.odooStatus === "Sent" && (
                                    <span
                                      style={{
                                        padding: "1px 7px",
                                        borderRadius: 4,
                                        fontSize: 10,
                                        fontWeight: 600,
                                        background: "#fef2f2",
                                        color: "#b91c1c",
                                      }}
                                    >
                                      Already sent to Odoo — corrected push
                                      needed after regeneration
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        justifyContent: "flex-end",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        onClick={() => setDeleteModal({ phase: "idle" })}
                        style={{
                          padding: "9px 18px",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: 8,
                          fontSize: 13,
                          cursor: "pointer",
                          background: "#fff",
                          color: "#374151",
                        }}
                      >
                        Cancel
                      </button>
                      {hasConflict && preview.safeCount > 0 && (
                        <button
                          onClick={() => handleDeleteConfirm(false)}
                          style={{
                            padding: "9px 18px",
                            border: "none",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            background: "#b8923a",
                            color: "#fff",
                          }}
                        >
                          Delete Safe Only ({preview.safeCount})
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteConfirm(hasConflict)}
                        style={{
                          padding: "9px 18px",
                          border: "none",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          background: "#dc2626",
                          color: "#fff",
                        }}
                      >
                        {hasConflict
                          ? `Delete All + Cascade (${deleteModal.ids.length})`
                          : `Delete (${deleteModal.ids.length})`}
                      </button>
                    </div>
                  </>
                );
              })()}

            {deleteModal.phase === "deleting" && (
              <p style={{ color: "#64748b", fontSize: 14 }}>
                Deleting records…
              </p>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

// ── Audit History tab ────────────────────────────────────────────────────
// Read-only — populated exclusively by the trg_DailyInterestLog_Audit database trigger, so
// every change shows up here regardless of whether it went through this app at all (a raw
// SQL UPDATE run directly against the DB is captured too, just with Source = "Unattributed").

const AUDIT_DEFAULT_PAGE_SIZE = 25;

function DiffCell({
  oldVal,
  newVal,
  format,
}: {
  oldVal: unknown;
  newVal: unknown;
  format?: (v: unknown) => string;
}) {
  if (oldVal == null && newVal == null) {
    return <span style={{ color: "#cbd5e1" }}>—</span>;
  }
  const fmt = format ?? ((v: unknown) => String(v));
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {oldVal != null && (
        <span style={{ color: "#991b1b", textDecoration: "line-through" }}>
          {fmt(oldVal)}
        </span>
      )}
      {oldVal != null && newVal != null && (
        <span style={{ color: "#94a3b8", margin: "0 4px" }}>→</span>
      )}
      {newVal != null && (
        <span style={{ color: "#15803d", fontWeight: 600 }}>{fmt(newVal)}</span>
      )}
    </span>
  );
}

const CHANGE_TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  Created: { bg: "#f0fdf4", fg: "#15803d" },
  Updated: { bg: "#eff6ff", fg: "#1d4ed8" },
  Deleted: { bg: "#fef2f2", fg: "#b91c1c" },
  TriggerError: { bg: "#fef9c3", fg: "#854d0e" },
};

function DailyInterestAuditTab({
  initialLogId,
  onClearLogFilter,
}: {
  initialLogId: number | null;
  onClearLogFilter: () => void;
}) {
  const [result, setResult] = useState<PagedResult<DailyInterestAuditItem> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [logId, setLogId] = useState(initialLogId != null ? String(initialLogId) : "");
  const [appId, setAppId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [changeType, setChangeType] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(AUDIT_DEFAULT_PAGE_SIZE);
  const [sortOn, setSortOn] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const toggleSort = (key: string) => {
    if (sortOn === key) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortOn(key);
      setSortDirection("asc");
    }
    setPage(1);
  };

  // A different row's "History" click while already on this tab should re-seed the filter.
  useEffect(() => {
    setLogId(initialLogId != null ? String(initialLogId) : "");
    setPage(1);
  }, [initialLogId]);

  const load = useCallback(() => {
    setLoading(true);
    const params: QueryParams = { page, pageSize, sortOn, sortDirection };
    if (logId) params.logId = logId;
    if (appId) params.appId = appId;
    if (from) params.from = from;
    if (to) params.to = to;
    if (source) params.source = source;
    if (actorEmail) params.actorEmail = actorEmail;
    if (changeType.length === 1) params.changeType = changeType[0];
    adminApi
      .dailyInterestAudits(params)
      .then((r) => {
        if (r.success) setResult(r.data);
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, logId, appId, from, to, source, actorEmail, changeType, sortOn, sortDirection]);

  useEffect(() => {
    load();
  }, [load]);

  const resetFilters = () => {
    setLogId("");
    setAppId("");
    setFrom("");
    setTo("");
    setSource("");
    setActorEmail("");
    setChangeType([]);
    setPage(1);
    onClearLogFilter();
  };

  const totalPages = result ? Math.ceil(result.totalCount / pageSize) : 1;

  const td: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: 12,
    color: "#374151",
    borderBottom: "1px solid #f1f5f9",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="number"
          placeholder="Log ID"
          value={logId}
          onChange={(e) => {
            setLogId(e.target.value);
            setPage(1);
          }}
          style={{ padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, width: 110 }}
        />
        <input
          type="number"
          placeholder="Application ID"
          value={appId}
          onChange={(e) => {
            setAppId(e.target.value);
            setPage(1);
          }}
          style={{ padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, width: 150 }}
        />
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          style={{ padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          style={{ padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
        />
        <input
          type="text"
          placeholder="Source contains…"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPage(1);
          }}
          style={{ padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, minWidth: 180 }}
        />
        <input
          type="text"
          placeholder="Actor email contains…"
          value={actorEmail}
          onChange={(e) => {
            setActorEmail(e.target.value);
            setPage(1);
          }}
          style={{ padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, minWidth: 180 }}
        />
        <MultiSelectFilter
          allLabel="All Change Types"
          buttonLabel="Change Type"
          options={[
            { value: "Created", label: "Created" },
            { value: "Updated", label: "Updated" },
            { value: "Deleted", label: "Deleted" },
            { value: "TriggerError", label: "Trigger Error" },
          ]}
          selectedValues={changeType}
          onChange={(next) => {
            setChangeType(next);
            setPage(1);
          }}
          minWidth={190}
        />
        {(logId || appId || from || to || source || actorEmail || hasMultiFilterValue(changeType)) && (
          <button
            onClick={resetFilters}
            style={{
              padding: "9px 14px",
              background: "#f1f5f9",
              color: "#475569",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: "#64748b", fontSize: 14 }}>Loading…</p>
      ) : (
        <>
          <div className="table-scroll">
            <table style={{ minWidth: 1400 }}>
              <thead>
                <tr>
                  <SortableTh label="Timestamp" sortKey="timestamp" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                  <SortableTh label="Log ID" sortKey="logid" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                  <SortableTh label="App ID" sortKey="appid" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                  <th>Type</th>
                  <SortableTh label="Source" sortKey="source" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                  <SortableTh label="Actor" sortKey="actor" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                  <th>Units</th>
                  <th>Capital</th>
                  <th>Net Interest</th>
                  <th>Odoo Status</th>
                  <th>Distributed</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {result?.items.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: 32 }}>
                      No audit records found.
                    </td>
                  </tr>
                )}
                {result?.items.map((row) => {
                  const colors = CHANGE_TYPE_COLORS[row.changeType] ?? { bg: "#f1f5f9", fg: "#475569" };
                  return (
                    <tr key={row.id}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {new Date(row.timestampUtc).toLocaleString()}
                      </td>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => setLogId(String(row.dailyInterestLogId))}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            color: "#6d28d9",
                            textDecoration: "underline",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          #{row.dailyInterestLogId}
                        </button>
                      </td>
                      <td style={td}>
                        <Link
                          href={`/applications/${row.applicationId}`}
                          style={{ color: "#b8923a", fontWeight: 600, textDecoration: "underline" }}
                        >
                          #{row.applicationId}
                        </Link>
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            background: colors.bg,
                            color: colors.fg,
                          }}
                        >
                          {row.changeType}
                        </span>
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{row.source}</td>
                      <td style={td}>
                        {row.actorEmail ? (
                          <>
                            <div style={{ fontWeight: 500 }}>{row.actorEmail}</div>
                            {row.actorRole && (
                              <div style={{ fontSize: 10, color: "#9ca3af" }}>{row.actorRole}</div>
                            )}
                          </>
                        ) : (
                          <span style={{ color: "#9ca3af" }}>System</span>
                        )}
                      </td>
                      <td style={td}>
                        <DiffCell oldVal={row.oldUnits} newVal={row.newUnits} />
                      </td>
                      <td style={td}>
                        <DiffCell
                          oldVal={row.oldCapital}
                          newVal={row.newCapital}
                          format={(v) => `$${(v as number).toLocaleString()}`}
                        />
                      </td>
                      <td style={td}>
                        <DiffCell
                          oldVal={row.oldNetInterest}
                          newVal={row.newNetInterest}
                          format={(v) => `$${(v as number).toFixed(4)}`}
                        />
                      </td>
                      <td style={td}>
                        <DiffCell oldVal={row.oldOdooStatus} newVal={row.newOdooStatus} />
                      </td>
                      <td style={td}>
                        <DiffCell
                          oldVal={row.oldIncludedInMonthlyDistribution}
                          newVal={row.newIncludedInMonthlyDistribution}
                          format={(v) => (v ? "Yes" : "No")}
                        />
                      </td>
                      <td style={{ ...td, maxWidth: 260 }} title={row.reason ?? ""}>
                        {row.reason ?? "—"}
                      </td>
                    </tr>
                  );
                })}
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
              summary={`${result?.totalCount ?? 0} audit record(s)`}
            />
          </div>
        </>
      )}
    </div>
  );
}
