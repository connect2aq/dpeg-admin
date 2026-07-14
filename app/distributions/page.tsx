"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { PaginationControls } from "@/components/PaginationControls";
import { StatusBadge } from "@/components/StatusBadge";
import { SortableTh } from "@/components/SortableTh";
import {
  adminApi,
  type DistributionListItem,
  type DistributionRunResult,
  type PagedResult,
} from "@/lib/api";
import { downloadCsv } from "@/lib/exportCsv";
import {
  encodeMultiFilterValue,
  hasMultiFilterValue,
  parseMultiFilterValue,
} from "@/lib/filterUtils";
import type { QueryParams } from "@/lib/apiContracts";
import { formatShortDate } from "@/lib/dateFormat";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import Link from "next/link";

const STATUSES = ["Pending", "Sent", "Failed", "Paid"];
const MONTHS = [
  "",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
];
const MONTH_NAMES = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DEFAULT_PAGE_SIZE = 20;

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export default function DistributionsPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout>
          <div
            className="page-content"
            style={{ padding: 32, color: "#64748b" }}
          >
            Loading...
          </div>
        </AdminLayout>
      }
    >
      <DistributionsContent />
    </Suspense>
  );
}

function DistributionsContent() {
  const searchParams = useSearchParams();
  const [result, setResult] =
    useState<PagedResult<DistributionListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string[]>(() =>
    parseMultiFilterValue(searchParams.get("status")),
  );
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [appIdFilter, setAppIdFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortOn, setSortOn] = useState("month");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const toggleSort = (key: string) => {
    if (sortOn === key) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortOn(key);
      setSortDirection("asc");
    }
    setPage(1);
  };
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [historyPushingId, setHistoryPushingId] = useState<number | null>(null);
  const [paidDateInput, setPaidDateInput] = useState<{ [id: number]: string }>(
    {},
  );
  // Edit Paid Date
  const [editingPaidDateId, setEditingPaidDateId] = useState<number | null>(
    null,
  );
  const [editPaidDateValue, setEditPaidDateValue] = useState("");
  const [editPaidDateSaving, setEditPaidDateSaving] = useState(false);
  const [editPaidDatePendingIds, setEditPaidDatePendingIds] = useState<
    Set<number>
  >(new Set());
  // Bulk selection for history table
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<number>>(
    new Set(),
  );
  const [bulkPaidDate, setBulkPaidDate] = useState("");
  const [bulkPaidDateError, setBulkPaidDateError] = useState(false);
  const [historyBulkPushing, setHistoryBulkPushing] = useState(false);
  const [historyBulkMarkingPaid, setHistoryBulkMarkingPaid] = useState(false);
  const [historyBulkResult, setHistoryBulkResult] = useState<string | null>(
    null,
  );
  const [expandedBankRows, setExpandedBankRows] = useState<Set<string>>(
    new Set(),
  );

  // Catch-up state
  const [catchUpFrom, setCatchUpFrom] = useState(firstOfMonthStr());
  const [catchUpTo, setCatchUpTo] = useState(yesterdayStr());
  const [catchUpLoading, setCatchUpLoading] = useState(false);
  const [catchUpResult, setCatchUpResult] = useState<{
    appsProcessed: number;
    logsCreated: number;
    errors: string[];
  } | null>(null);
  const [catchUpError, setCatchUpError] = useState<string | null>(null);

  // Run distribution state
  const [runDate, setRunDate] = useState(todayStr());
  const [runMode, setRunMode] = useState<"preview" | "execute" | null>(null);
  const [runResults, setRunResults] = useState<DistributionRunResult[] | null>(
    null,
  );
  const [runLoading, setRunLoading] = useState(false);
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [pushedIds, setPushedIds] = useState<Set<number>>(new Set());
  const [markingResultId, setMarkingResultId] = useState<number | null>(null);
  const [markedPaidIds, setMarkedPaidIds] = useState<Set<number>>(new Set());
  const [resultPaidDateInput, setResultPaidDateInput] = useState<{
    [id: number]: string;
  }>({});
  const [resultPaidDateError, setResultPaidDateError] = useState<Set<number>>(
    new Set(),
  );
  const [batchPushing, setBatchPushing] = useState(false);
  const [batchResult, setBatchResult] = useState<{
    pushed: number;
    failed: number;
  } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const exportToExcel = async () => {
    setExporting(true);
    const params: QueryParams = {
      page: 1,
      pageSize: 100000,
    };
    const encodedStatus = encodeMultiFilterValue(status);
    if (encodedStatus) params.status = encodedStatus;
    if (search) params.search = search;
    if (month) params.month = month;
    if (year) params.year = year;
    const parsedAppId = parseInt(appIdFilter, 10);
    if (!isNaN(parsedAppId) && parsedAppId > 0)
      params.applicationId = parsedAppId;
    const r = await adminApi.distributions(params);
    if (r.success) {
      const headers = [
        "ID",
        "App ID",
        "Account User",
        "Investor Name",
        "Email",
        "Distribution Month",
        "Total Net Amount",
        "Payment Status",
        "Paid At",
        "Bank Name",
        "Account Number",
        "Created",
      ];
      const rows = r.data.items.map((d) => [
        d.id,
        d.applicationId,
        d.userName,
        d.investorName,
        d.investorEmail ?? "",
        d.distributionMonth ? formatShortDate(d.distributionMonth) : "",
        d.totalNetAmount,
        d.paymentStatus,
        d.paidAt ? formatShortDate(d.paidAt) : "",
        d.bankName ?? "",
        d.bankAccountNumber ?? "",
        formatShortDate(d.createdOn),
      ]);
      downloadCsv([headers, ...rows], "distributions.csv");
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
    const encodedStatus = encodeMultiFilterValue(status);
    if (encodedStatus) params.status = encodedStatus;
    if (search) params.search = search;
    if (month) params.month = month;
    if (year) params.year = year;
    const parsedAppId = parseInt(appIdFilter, 10);
    if (!isNaN(parsedAppId) && parsedAppId > 0)
      params.applicationId = parsedAppId;
    adminApi
      .distributions(params)
      .then((r) => {
        if (r.success) setResult(r.data);
      })
      .finally(() => setLoading(false));
  }, [
    page,
    pageSize,
    status,
    search,
    month,
    year,
    appIdFilter,
    sortOn,
    sortDirection,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const markPaid = async (id: number) => {
    const paidDate = paidDateInput[id] || todayStr();
    setMarkingId(id);
    const r = await adminApi.markDistributionPaid(id, paidDate);
    setMarkingId(null);
    if (r.success) load();
  };

  const handleHistoryPushOne = async (id: number) => {
    setHistoryPushingId(id);
    await adminApi.pushDistributionToOdoo(id);
    setHistoryPushingId(null);
    load();
  };

  const handleEditPaidDate = async (id: number) => {
    if (!editPaidDateValue) return;
    setEditPaidDateSaving(true);
    const r = await adminApi.editDistributionPaidDate(id, editPaidDateValue);
    setEditPaidDateSaving(false);
    setEditingPaidDateId(null);
    setEditPaidDateValue("");
    if (r.success && (r.data as { status?: string })?.status === "Pending") {
      setEditPaidDatePendingIds((prev) => new Set([...prev, id]));
    } else if (r.success) {
      load();
    }
  };

  const handleHistoryBulkPush = async () => {
    const ids = [...selectedHistoryIds];
    setHistoryBulkPushing(true);
    setHistoryBulkResult(null);
    const r = await adminApi.batchPushToOdoo(ids);
    setHistoryBulkPushing(false);
    if (r.success) {
      setHistoryBulkResult(
        `Pushed ${r.data.pushed} record${r.data.pushed !== 1 ? "s" : ""}${r.data.failed > 0 ? `, ${r.data.failed} failed` : ""}.`,
      );
      setSelectedHistoryIds(new Set());
      load();
    }
  };

  const handleHistoryBulkMarkPaid = async () => {
    if (!bulkPaidDate) {
      setBulkPaidDateError(true);
      return;
    }
    setBulkPaidDateError(false);
    const ids = [...selectedHistoryIds];
    setHistoryBulkMarkingPaid(true);
    setHistoryBulkResult(null);
    const r = await adminApi.bulkMarkDistributionPaid(ids, bulkPaidDate);
    setHistoryBulkMarkingPaid(false);
    if (r.success) {
      setHistoryBulkResult(
        `Marked ${r.data.marked} record${r.data.marked !== 1 ? "s" : ""} as paid${r.data.failed > 0 ? `, ${r.data.failed} failed` : ""}.`,
      );
      setSelectedHistoryIds(new Set());
      setBulkPaidDate("");
      load();
    }
  };

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

  const handlePreview = async () => {
    setRunLoading(true);
    setRunMode("preview");
    setRunResults(null);
    setBatchResult(null);
    setPushedIds(new Set());
    setRunError(null);
    const r = await adminApi.simulateDistribution(runDate);
    setRunLoading(false);
    if (r.success) setRunResults(r.data);
    else setRunError("Preview failed. Check the date and try again.");
  };

  const handleExecute = async () => {
    setRunLoading(true);
    setRunMode("execute");
    setRunResults(null);
    setBatchResult(null);
    setPushedIds(new Set());
    setMarkedPaidIds(new Set());
    setMarkingResultId(null);
    setResultPaidDateInput({});
    setResultPaidDateError(new Set());
    setRunError(null);
    const r = await adminApi.executeDistribution(runDate);
    setRunLoading(false);
    if (r.success) {
      setRunResults(r.data);
      load();
    } else setRunError("Execute failed. Check the date and try again.");
  };

  const handlePushOne = async (id: number) => {
    setPushingId(id);
    const r = await adminApi.pushDistributionToOdoo(id);
    setPushingId(null);
    if (r.success) {
      setPushedIds((prev) => new Set([...prev, id]));
      load();
    }
  };

  const handleMarkOnePaid = async (id: number) => {
    const paidDate = resultPaidDateInput[id];
    if (!paidDate) {
      setResultPaidDateError((prev) => new Set([...prev, id]));
      return;
    }
    setResultPaidDateError((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
    setMarkingResultId(id);
    const r = await adminApi.markDistributionPaid(id, paidDate);
    setMarkingResultId(null);
    if (r.success) {
      setMarkedPaidIds((prev) => new Set([...prev, id]));
      load();
    }
  };

  const handleBatchPush = async () => {
    const ids = (runResults ?? [])
      .filter(
        (r) =>
          !r.alreadyRan &&
          r.distributionLogId !== null &&
          !pushedIds.has(r.distributionLogId!),
      )
      .map((r) => r.distributionLogId!);
    if (!ids.length) return;
    setBatchPushing(true);
    setBatchResult(null);
    const r = await adminApi.batchPushToOdoo(ids);
    setBatchPushing(false);
    if (r.success) {
      setBatchResult(r.data);
      setPushedIds((prev) => new Set([...prev, ...ids]));
      load();
    }
  };

  const totalPages = result ? Math.ceil(result.totalCount / pageSize) : 1;
  const pendingPushCount = (runResults ?? []).filter(
    (r) =>
      !r.alreadyRan &&
      r.distributionLogId !== null &&
      !pushedIds.has(r.distributionLogId!) &&
      !markedPaidIds.has(r.distributionLogId!),
  ).length;

  const colStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: 13,
    color: "#374151",
    borderBottom: "1px solid #f1f5f9",
    whiteSpace: "nowrap",
  };

  const toggleBankDetails = (key: string) => {
    setExpandedBankRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderBankCell = (
    key: string,
    bankName?: string | null,
    bankAccountNumber?: string | null,
    routingNumber?: string | null,
  ) => {
    if (!bankName && !bankAccountNumber) {
      return <span style={{ color: "#9ca3af" }}>—</span>;
    }

    const isExpanded = expandedBankRows.has(key);
    const maskedAccount =
      bankAccountNumber && bankAccountNumber.length >= 4
        ? `••••${bankAccountNumber.slice(-4)}`
        : bankAccountNumber;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          type="button"
          onClick={() => toggleBankDetails(key)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: 0,
            border: "none",
            background: "transparent",
            color: "#0f2342",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>
            <div>{bankName ?? "Bank"}</div>
            <div>{maskedAccount ? `${maskedAccount}` : ""}</div>
          </div>
        </button>
        {isExpanded && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              padding: "8px 10px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              whiteSpace: "normal",
            }}
          >
            {bankName && (
              <div>
                <span style={{ fontSize: 11, color: "#64748b" }}>Bank:</span>{" "}
                {bankName}
              </div>
            )}
            {bankAccountNumber && (
              <div>
                <span style={{ fontSize: 11, color: "#64748b" }}>Account:</span>{" "}
                {bankAccountNumber}
              </div>
            )}
            {routingNumber && (
              <div>
                <span style={{ fontSize: 11, color: "#64748b" }}>Routing:</span>{" "}
                {routingNumber}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px" }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#0e3416",
            marginBottom: 24,
          }}
        >
          Monthly Distributions
        </h1>

        {/* Catch-Up Panel */}
        <div
          style={{
            background: "#fefce8",
            border: "1.5px solid #fde68a",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 16,
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
            Step 1 — Backfill Missing Daily Interest
          </div>
          <div style={{ fontSize: 13, color: "#78350f", marginBottom: 14 }}>
            Run this first if daily interest logs are missing for a date range
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
                  " Now run Preview below to see updated amounts."}
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

        {/* Run Distribution Panel */}
        <div
          style={{
            background: "#f8fafc",
            border: "1.5px solid #e2e8f0",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 28,
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#0f2342",
              marginBottom: 14,
            }}
          >
            Step 2 — Run Distribution
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
            Pick a date to calculate distributions for all active investors from
            the 1st of that month up to the chosen date.
            <br />
            Preview shows projected amounts without saving. Execute saves
            records and lets you push to Odoo.
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              type="date"
              value={runDate}
              onChange={(e) => {
                setRunDate(e.target.value);
                setRunResults(null);
                setBatchResult(null);
              }}
              style={{
                padding: "9px 12px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 14,
              }}
            />
            <button
              onClick={handlePreview}
              disabled={runLoading}
              style={{
                padding: "9px 20px",
                background: "#fff",
                color: "#0f2342",
                border: "1.5px solid #0f2342",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: runLoading ? "not-allowed" : "pointer",
                opacity: runLoading ? 0.6 : 1,
              }}
            >
              {runLoading && runMode === "preview" ? "Previewing…" : "Preview"}
            </button>
            <button
              onClick={handleExecute}
              disabled={runLoading}
              style={{
                padding: "9px 20px",
                background: "#0f2342",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: runLoading ? "not-allowed" : "pointer",
                opacity: runLoading ? 0.6 : 1,
              }}
            >
              {runLoading && runMode === "execute" ? "Executing…" : "Execute"}
            </button>
          </div>
          {runError && (
            <div style={{ marginTop: 10, fontSize: 13, color: "#dc2626" }}>
              {runError}
            </div>
          )}
        </div>

        {/* Run Results */}
        {runResults !== null && (
          <div style={{ marginBottom: 32 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f2342" }}>
                {runMode === "preview" ? "Preview" : "Execution"} Results —{" "}
                {runDate}
                <span
                  style={{
                    marginLeft: 10,
                    fontSize: 13,
                    fontWeight: 400,
                    color: "#64748b",
                  }}
                >
                  {runResults.filter((r) => !r.alreadyRan).length} record
                  {runResults.filter((r) => !r.alreadyRan).length !== 1
                    ? "s"
                    : ""}{" "}
                  across{" "}
                  {
                    new Set(
                      runResults
                        .filter((r) => !r.alreadyRan)
                        .map((r) => r.applicationId),
                    ).size
                  }{" "}
                  investor
                  {new Set(
                    runResults
                      .filter((r) => !r.alreadyRan)
                      .map((r) => r.applicationId),
                  ).size !== 1
                    ? "s"
                    : ""}{" "}
                  • $
                  {runResults
                    .filter((r) => !r.alreadyRan)
                    .reduce((s, r) => s + r.totalNetAmount, 0)
                    .toFixed(2)}{" "}
                  total
                </span>
              </div>
              {runMode === "execute" && pendingPushCount > 0 && (
                <button
                  onClick={handleBatchPush}
                  disabled={batchPushing}
                  style={{
                    padding: "8px 18px",
                    background: "#b8923a",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: batchPushing ? "not-allowed" : "pointer",
                    opacity: batchPushing ? 0.6 : 1,
                  }}
                >
                  {batchPushing
                    ? "Pushing…"
                    : `Push All to Odoo (${pendingPushCount})`}
                </button>
              )}
            </div>
            {batchResult && (
              <div
                style={{
                  marginBottom: 10,
                  padding: "8px 14px",
                  background: batchResult.failed > 0 ? "#fff7ed" : "#f0fdf4",
                  borderRadius: 8,
                  fontSize: 13,
                  color: batchResult.failed > 0 ? "#92400e" : "#15803d",
                  fontWeight: 500,
                }}
              >
                Batch push: {batchResult.pushed} sent
                {batchResult.failed > 0 ? `, ${batchResult.failed} failed` : ""}
              </div>
            )}
            <div className="table-scroll">
              <table style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    {[
                      "Investor",
                      "Month",
                      "PPM",
                      "Days",
                      "Amount",
                      "Recalculated",
                      "Bank",
                      "Status",
                      ...(runMode === "execute" ? ["Actions"] : []),
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runResults.length === 0 && (
                    <tr>
                      <td
                        colSpan={10}
                        style={{
                          ...colStyle,
                          textAlign: "center",
                          color: "#9ca3af",
                          padding: 32,
                        }}
                      >
                        No investors to distribute for this date
                      </td>
                    </tr>
                  )}
                  {runResults.map((r, i) => {
                    const isPushed =
                      r.distributionLogId !== null &&
                      pushedIds.has(r.distributionLogId);
                    const isMarkedPaid =
                      r.distributionLogId !== null &&
                      markedPaidIds.has(r.distributionLogId);
                    return (
                      <tr
                        key={i}
                        style={{
                          background: r.alreadyRan
                            ? "#f8fafc"
                            : r.hasMismatch
                              ? "#fff7ed"
                              : undefined,
                        }}
                      >
                        <td style={colStyle}>
                          <div
                            style={{
                              fontWeight: 500,
                              color: r.alreadyRan ? "#9ca3af" : undefined,
                            }}
                          >
                            {r.investorName}
                          </div>
                          {r.investorEmail && (
                            <div style={{ fontSize: 12, color: "#9ca3af" }}>
                              {r.investorEmail}
                            </div>
                          )}
                          {r.hasMismatch && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "#d97706",
                                fontWeight: 600,
                              }}
                            >
                              ⚠ Mismatch
                            </span>
                          )}
                          {r.alreadyRan && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "#94a3b8",
                                fontWeight: 600,
                              }}
                            >
                              Already ran
                            </span>
                          )}
                        </td>
                        <td style={{ ...colStyle, fontWeight: 500 }}>
                          {formatShortDate(r.distributionMonth)}
                        </td>
                        <td style={{ ...colStyle, color: "#9ca3af" }}>
                          {r.ppmRefNo || "—"}
                        </td>
                        <td style={colStyle}>
                          {r.alreadyRan ? "—" : r.totalDays}
                        </td>
                        <td style={{ ...colStyle, fontWeight: 600 }}>
                          {r.alreadyRan
                            ? "—"
                            : `$${r.totalNetAmount.toFixed(2)}`}
                        </td>
                        <td style={colStyle}>
                          {r.alreadyRan
                            ? "—"
                            : `$${r.recalculatedAmount.toFixed(2)}`}
                        </td>
                        <td style={colStyle}>
                          {renderBankCell(
                            `run-${r.distributionLogId ?? r.applicationId}-${i}`,
                            r.bankName,
                            r.bankAccountNumber,
                          )}
                        </td>
                        <td style={colStyle}>
                          {r.alreadyRan ? (
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>
                              Skipped
                            </span>
                          ) : runMode === "preview" ? (
                            <span style={{ fontSize: 12, color: "#64748b" }}>
                              Preview only
                            </span>
                          ) : isPushed ? (
                            <StatusBadge status="Sent" />
                          ) : (
                            <StatusBadge status="Pending" />
                          )}
                        </td>
                        {runMode === "execute" && (
                          <td style={{ ...colStyle, minWidth: 260 }}>
                            {!r.alreadyRan &&
                              r.distributionLogId !== null &&
                              !isPushed &&
                              !isMarkedPaid && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                  }}
                                >
                                  <button
                                    onClick={() =>
                                      handlePushOne(r.distributionLogId!)
                                    }
                                    disabled={
                                      pushingId === r.distributionLogId ||
                                      markingResultId === r.distributionLogId
                                    }
                                    style={{
                                      padding: "5px 12px",
                                      background: "#b8923a",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: 5,
                                      fontSize: 12,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      opacity:
                                        pushingId === r.distributionLogId
                                          ? 0.6
                                          : 1,
                                      alignSelf: "flex-start",
                                    }}
                                  >
                                    {pushingId === r.distributionLogId
                                      ? "…"
                                      : "Push to Odoo"}
                                  </button>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 5,
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <input
                                      type="date"
                                      value={
                                        resultPaidDateInput[
                                          r.distributionLogId
                                        ] || ""
                                      }
                                      onChange={(e) => {
                                        setResultPaidDateInput((prev) => ({
                                          ...prev,
                                          [r.distributionLogId!]:
                                            e.target.value,
                                        }));
                                        if (e.target.value)
                                          setResultPaidDateError((prev) => {
                                            const s = new Set(prev);
                                            s.delete(r.distributionLogId!);
                                            return s;
                                          });
                                      }}
                                      style={{
                                        padding: "4px 7px",
                                        border: `1px solid ${resultPaidDateError.has(r.distributionLogId) ? "#dc2626" : "#d1d5db"}`,
                                        borderRadius: 5,
                                        fontSize: 12,
                                      }}
                                    />
                                    <button
                                      onClick={() =>
                                        handleMarkOnePaid(r.distributionLogId!)
                                      }
                                      disabled={
                                        markingResultId ===
                                          r.distributionLogId ||
                                        pushingId === r.distributionLogId
                                      }
                                      style={{
                                        padding: "5px 12px",
                                        background: "#0f2342",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: 5,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        opacity:
                                          markingResultId ===
                                          r.distributionLogId
                                            ? 0.6
                                            : 1,
                                      }}
                                    >
                                      {markingResultId === r.distributionLogId
                                        ? "…"
                                        : "Mark Paid"}
                                    </button>
                                  </div>
                                  {resultPaidDateError.has(
                                    r.distributionLogId,
                                  ) && (
                                    <span
                                      style={{ fontSize: 11, color: "#dc2626" }}
                                    >
                                      Please enter a paid date
                                    </span>
                                  )}
                                </div>
                              )}
                            {isPushed && (
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#16a34a",
                                  fontWeight: 600,
                                }}
                              >
                                ✓ Sent to Odoo
                              </span>
                            )}
                            {isMarkedPaid && (
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#0f2342",
                                  fontWeight: 600,
                                }}
                              >
                                ✓ Marked Paid —{" "}
                                {resultPaidDateInput[r.distributionLogId!] ||
                                  ""}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
            Distribution History
          </span>
          <MultiSelectFilter
            allLabel="All Statuses"
            buttonLabel="Status"
            options={STATUSES.map((item) => ({ value: item, label: item }))}
            selectedValues={status}
            onChange={(next) => {
              setStatus(next);
              setPage(1);
              setSelectedHistoryIds(new Set());
            }}
            minWidth={180}
          />
          <input
            type="text"
            placeholder="Search investor name"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              setSelectedHistoryIds(new Set());
            }}
            style={{
              padding: "10px 14px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
              minWidth: 150,
            }}
          />
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(1);
              setSelectedHistoryIds(new Set());
            }}
            style={{
              padding: "10px 14px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
              background: "white",
            }}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={m}>
                {m ? MONTH_NAMES[i] : "All Months"}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Year (e.g. 2026)"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setPage(1);
              setSelectedHistoryIds(new Set());
            }}
            style={{
              padding: "10px 14px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
              width: 150,
            }}
          />
          <input
            type="number"
            placeholder="App ID"
            value={appIdFilter}
            onChange={(e) => {
              setAppIdFilter(e.target.value);
              setPage(1);
              setSelectedHistoryIds(new Set());
            }}
            style={{
              padding: "10px 14px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
              width: 120,
            }}
          />
          <button
            onClick={exportToExcel}
            disabled={exporting}
            style={{
              padding: "10px 18px",
              background: "#10b981",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: exporting ? "not-allowed" : "pointer",
              opacity: exporting ? 0.7 : 1,
            }}
          >
            {exporting ? "Exporting…" : "↓ Export"}
          </button>
          {(hasMultiFilterValue(status) ||
            search ||
            month ||
            year ||
            appIdFilter) && (
            <button
              onClick={() => {
                setStatus([]);
                setSearch("");
                setMonth("");
                setYear("");
                setAppIdFilter("");
                setPage(1);
                setSelectedHistoryIds(new Set());
              }}
              style={{
                padding: "10px 14px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 14,
                background: "white",
                color: "#475569",
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          )}
        </div>

        {/* Bulk action bar */}
        {selectedHistoryIds.size > 0 && (
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
              {selectedHistoryIds.size} selected
            </span>
            <button
              onClick={handleHistoryBulkPush}
              disabled={historyBulkPushing || historyBulkMarkingPaid}
              style={{
                padding: "7px 16px",
                background: "#b8923a",
                color: "#fff",
                border: "none",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                opacity: historyBulkPushing ? 0.6 : 1,
              }}
            >
              {historyBulkPushing
                ? "Pushing…"
                : `Push to Odoo (${selectedHistoryIds.size})`}
            </button>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="date"
                value={bulkPaidDate}
                onChange={(e) => {
                  setBulkPaidDate(e.target.value);
                  setBulkPaidDateError(false);
                }}
                style={{
                  padding: "6px 10px",
                  border: `1.5px solid ${bulkPaidDateError ? "#dc2626" : "#d1d5db"}`,
                  borderRadius: 7,
                  fontSize: 13,
                }}
              />
              <button
                onClick={handleHistoryBulkMarkPaid}
                disabled={historyBulkMarkingPaid || historyBulkPushing}
                style={{
                  padding: "7px 16px",
                  background: "#0f2342",
                  color: "#fff",
                  border: "none",
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: historyBulkMarkingPaid ? 0.6 : 1,
                }}
              >
                {historyBulkMarkingPaid
                  ? "Marking…"
                  : `Mark Paid (${selectedHistoryIds.size})`}
              </button>
              {bulkPaidDateError && (
                <span style={{ fontSize: 12, color: "#dc2626" }}>
                  Enter a date first
                </span>
              )}
            </div>
            <button
              onClick={() => setSelectedHistoryIds(new Set())}
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
        {historyBulkResult && (
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
            ✓ {historyBulkResult}
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
                    <th
                      style={{
                        padding: "12px 8px 12px 16px",
                        width: 40,
                        textAlign: "center",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={
                          !!result?.items.length &&
                          result.items.every((d) =>
                            selectedHistoryIds.has(d.id),
                          )
                        }
                        onChange={(e) => {
                          if (e.target.checked)
                            setSelectedHistoryIds(
                              new Set(result?.items.map((d) => d.id) ?? []),
                            );
                          else setSelectedHistoryIds(new Set());
                        }}
                      />
                    </th>
                    <SortableTh
                      label="App ID"
                      sortKey="applicationid"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Month"
                      sortKey="month"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Paid At"
                      sortKey="paidat"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Account User"
                      sortKey="userName"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Investor Name"
                      sortKey="investorname"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />

                    <SortableTh
                      label="Amount"
                      sortKey="amount"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Status"
                      sortKey="status"
                      sortOn={sortOn}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Bank"
                      sortKey="bank"
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
                        colSpan={9}
                        style={{
                          ...colStyle,
                          textAlign: "center",
                          color: "#9ca3af",
                          padding: 32,
                        }}
                      >
                        No distributions found
                      </td>
                    </tr>
                  )}
                  {result?.items.map((d) => {
                    const monthDate = new Date(d.distributionMonth);
                    const monthLabel = formatShortDate(monthDate);
                    const canMarkPaid = d.paymentStatus !== "Paid";
                    const canPushOdoo =
                      d.paymentStatus !== "Sent" && d.paymentStatus !== "Paid";
                    const isSelected = selectedHistoryIds.has(d.id);
                    return (
                      <tr
                        key={d.id}
                        style={{
                          background: isSelected
                            ? "#eff6ff"
                            : d.hasMismatch
                              ? "#fff7ed"
                              : undefined,
                        }}
                      >
                        <td
                          style={{
                            ...colStyle,
                            textAlign: "center",
                            width: 40,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) =>
                              setSelectedHistoryIds((prev) => {
                                const s = new Set(prev);
                                if (e.target.checked) s.add(d.id);
                                else s.delete(d.id);
                                return s;
                              })
                            }
                          />
                        </td>
                        <td
                          style={{
                            ...colStyle,
                            fontFamily: "monospace",
                            color: "#64748b",
                            fontSize: 13,
                          }}
                        >
                          {d.applicationId}
                        </td>
                        <td style={colStyle}>{monthLabel}</td>
                        <td style={colStyle}>
                          {d.paidAt ? formatShortDate(d.paidAt) : "—"}
                        </td>
                        <td style={{ ...colStyle, fontWeight: 600 }}>
                          {d.userName || "—"}
                        </td>
                        <td style={colStyle}>
                          <Link
                            href={`/investor-statements?userId=${d.userId}`}
                            style={{
                              fontWeight: 600,
                              color: "#1e293b",
                              textDecoration: "underline",
                            }}
                          >
                            {d.investorName}
                          </Link>
                          {d.investorEmail && (
                            <div style={{ fontSize: 12, color: "#9ca3af" }}>
                              {d.investorEmail}
                            </div>
                          )}
                          {d.hasMismatch && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "#d97706",
                                fontWeight: 600,
                              }}
                            >
                              ⚠ Mismatch
                            </span>
                          )}
                        </td>
                        <td style={{ ...colStyle, fontWeight: 600 }}>
                          ${d.totalNetAmount.toFixed(2)}
                        </td>
                        <td style={colStyle}>
                          <StatusBadge status={d.paymentStatus} />
                        </td>
                        <td style={colStyle}>
                          {renderBankCell(
                            `history-${d.id}`,
                            d.bankName,
                            d.bankAccountNumber,
                            d.routingNumber,
                          )}
                        </td>
                        <td style={{ ...colStyle, minWidth: 240 }}>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            {canPushOdoo && (
                              <button
                                onClick={() => handleHistoryPushOne(d.id)}
                                disabled={historyPushingId === d.id}
                                style={{
                                  padding: "5px 12px",
                                  background: "#b8923a",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 5,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  opacity: historyPushingId === d.id ? 0.6 : 1,
                                  alignSelf: "flex-start",
                                }}
                              >
                                {historyPushingId === d.id
                                  ? "…"
                                  : "Push to Odoo"}
                              </button>
                            )}
                            {canMarkPaid && (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  alignItems: "center",
                                }}
                              >
                                <input
                                  type="date"
                                  value={paidDateInput[d.id] || ""}
                                  onChange={(e) =>
                                    setPaidDateInput((prev) => ({
                                      ...prev,
                                      [d.id]: e.target.value,
                                    }))
                                  }
                                  style={{
                                    padding: "5px 8px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: 5,
                                    fontSize: 12,
                                  }}
                                />
                                <button
                                  onClick={() => markPaid(d.id)}
                                  disabled={markingId === d.id}
                                  style={{
                                    padding: "5px 12px",
                                    background: "#0f2342",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 5,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    opacity: markingId === d.id ? 0.6 : 1,
                                  }}
                                >
                                  {markingId === d.id ? "…" : "Mark Paid"}
                                </button>
                              </div>
                            )}
                            {/* Edit Paid Date */}
                            {d.paidAt &&
                              editingPaidDateId !== d.id &&
                              (editPaidDatePendingIds.has(d.id) ? (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#b45309",
                                    fontWeight: 600,
                                  }}
                                >
                                  ⏳ Pending approval
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingPaidDateId(d.id);
                                    setEditPaidDateValue(
                                      new Date(d.paidAt!)
                                        .toISOString()
                                        .split("T")[0],
                                    );
                                  }}
                                  style={{
                                    padding: "3px 10px",
                                    background: "none",
                                    border: "1px solid #94a3b8",
                                    borderRadius: 5,
                                    fontSize: 11,
                                    color: "#475569",
                                    cursor: "pointer",
                                    alignSelf: "flex-start",
                                  }}
                                >
                                  ✏ Edit Date
                                </button>
                              ))}
                            {d.paidAt && editingPaidDateId === d.id && (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 4,
                                  padding: "8px 10px",
                                  background: "#f8fafc",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 6,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: "#64748b",
                                    fontWeight: 600,
                                  }}
                                >
                                  New Paid At Date
                                </div>
                                <input
                                  type="date"
                                  value={editPaidDateValue}
                                  onChange={(e) =>
                                    setEditPaidDateValue(e.target.value)
                                  }
                                  style={{
                                    padding: "5px 8px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: 5,
                                    fontSize: 12,
                                  }}
                                />
                                <div style={{ display: "flex", gap: 5 }}>
                                  <button
                                    onClick={() => handleEditPaidDate(d.id)}
                                    disabled={
                                      editPaidDateSaving || !editPaidDateValue
                                    }
                                    style={{
                                      padding: "4px 12px",
                                      background: "#0f2342",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: 5,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      opacity: editPaidDateSaving ? 0.6 : 1,
                                    }}
                                  >
                                    {editPaidDateSaving ? "…" : "Save"}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingPaidDateId(null);
                                      setEditPaidDateValue("");
                                    }}
                                    style={{
                                      padding: "4px 10px",
                                      background: "none",
                                      border: "1px solid #e2e8f0",
                                      borderRadius: 5,
                                      fontSize: 11,
                                      cursor: "pointer",
                                      color: "#64748b",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
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

            <p style={{ marginTop: 12, fontSize: 13, color: "#94a3b8" }}>
              {result?.totalCount ?? 0} total distribution
              {result?.totalCount !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
