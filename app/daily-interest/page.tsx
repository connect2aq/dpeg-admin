"use client";
import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { PaginationControls } from "@/components/PaginationControls";
import { SortableTh } from "@/components/SortableTh";
import {
  adminApi,
  type DailyInterestItem,
  type PagedResult,
  type DeleteDailyInterestPreviewResult,
  type ResetMonthResult,
} from "@/lib/api";
import { downloadCsv } from "@/lib/exportCsv";
import { hasMultiFilterValue } from "@/lib/filterUtils";
import type { QueryParams } from "@/lib/apiContracts";
import { formatShortDate } from "@/lib/dateFormat";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import Link from "next/link";

const DEFAULT_PAGE_SIZE = 25;

function OdooStatus({ status }: { status?: string | null }) {
  if (!status) return <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>;
  const ok = status === "Success";
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: ok ? "#f0fdf4" : "#fef2f2",
        color: ok ? "#15803d" : "#dc2626",
      }}
    >
      {status}
    </span>
  );
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
  const [result, setResult] = useState<PagedResult<DailyInterestItem> | null>(
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
  const [pushingDIId, setPushingDIId] = useState<number | null>(null);
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
        d.investorName,
        d.investorEmail ?? "",
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

  const handlePushDailyInterest = async (id: number) => {
    setPushingDIId(id);
    await adminApi.pushDailyInterestToOdoo(id);
    setPushingDIId(null);
    load();
  };

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
                      label="Odoo ID"
                      sortKey="odooid"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Odoo Status"
                      sortKey="odoostatus"
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
                    <th>Action</th>
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
                    const canPush = row.odooStatus !== "Success";
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
                        <td style={td}>
                          <div style={{ fontWeight: 500 }}>
                            {row.investorName}
                          </div>
                          {row.investorEmail && (
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>
                              {row.investorEmail}
                            </div>
                          )}
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
                        <td
                          style={{
                            ...td,
                            fontFamily: "monospace",
                            fontSize: 11,
                          }}
                        >
                          {row.odooInterestId ?? "—"}
                        </td>
                        <td style={td}>
                          <OdooStatus status={row.odooStatus} />
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
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "nowrap",
                            }}
                          >
                            {canPush && (
                              <button
                                onClick={() => handlePushDailyInterest(row.id)}
                                disabled={pushingDIId === row.id}
                                style={{
                                  padding: "4px 11px",
                                  background: "#b8923a",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 5,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  opacity: pushingDIId === row.id ? 0.6 : 1,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {pushingDIId === row.id ? "…" : "Push to Odoo"}
                              </button>
                            )}
                            {row.includedInMonthlyDistribution && (
                              <button
                                onClick={() => handleResetMonth(row)}
                                title="Unmark this month's distribution so it can be re-run with corrected daily logs"
                                style={{
                                  padding: "4px 11px",
                                  background: "#f97316",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 5,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Reset Month
                              </button>
                            )}
                          </div>
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
      </div>

      {/* Reset Month confirmation modal */}
      {(resetModal.phase === "confirm" || resetModal.phase === "resetting") && (
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
      {(deleteModal.phase === "confirm" ||
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
