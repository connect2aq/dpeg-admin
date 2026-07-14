"use client";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { PaginationControls } from "@/components/PaginationControls";
import { EditableStatusBadge } from "@/components/StatusBadge";
import { PendingBadge } from "@/components/PendingBadge";
import { RedemptionEditModal } from "@/components/RedemptionEditModal";
import { SortableTh } from "@/components/SortableTh";
import {
  adminApi,
  type RedemptionListItem,
  type PagedResult,
  type PendingChangeItem,
  type PendingChangeDetail,
  type CreateRedemptionAdminRequest,
  type RedemptionCalculationPreview,
} from "@/lib/api";
import { downloadCsv } from "@/lib/exportCsv";
import { formatShortDate, formatShortDateTime } from "@/lib/dateFormat";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import {
  encodeMultiFilterValue,
  hasMultiFilterValue,
  parseMultiFilterValue,
} from "@/lib/filterUtils";
import type { QueryParams } from "@/lib/apiContracts";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const STATUSES = [
  { label: "UnderReview", value: "UnderReview" },
  { label: "Active", value: "Redeemed" },
  { label: "Rejected", value: "Rejected" },
];
const STATUS_OPTIONS = [
  { label: "Under Review", value: "UnderReview" },
  { label: "Redeemed", value: "Active" },
  { label: "Rejected", value: "Rejected" },
];
const DEFAULT_PAGE_SIZE = 20;

// AggregatePurchasePrice = principal + interest; Income (ProratedPreferredReturn) is the interest
// portion, so Capital Redeemed backs out the principal — mirrors the investor statement's
// Capital/Income split.
const income = (r: RedemptionListItem) =>
  parseFloat(r.proratedPreferredReturn ?? "0") || 0;
const capitalRedeemed = (r: RedemptionListItem) =>
  (parseFloat(r.aggregatePurchasePrice ?? "0") || 0) - income(r);
const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RedemptionsPage() {
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
      <RedemptionsContent />
    </Suspense>
  );
}

function RedemptionsContent() {
  const route = useRouter();
  const { user: authUser } = useAdminAuth();
  const isSuperAdmin = (authUser?.adminRole ?? "SuperAdmin") === "SuperAdmin";
  const searchParams = useSearchParams();
  const [result, setResult] = useState<PagedResult<RedemptionListItem> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string[]>(() =>
    parseMultiFilterValue(searchParams.get("status")),
  );
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortOn, setSortOn] = useState("createdOn");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: string) => {
    if (sortOn === key) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortOn(key);
      setSortDirection("asc");
    }
    setPage(1);
  };

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [pendingMap, setPendingMap] = useState<
    Record<number, PendingChangeItem>
  >({});
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
  const [statusErrorId, setStatusErrorId] = useState<number | null>(null);
  const [statusError, setStatusError] = useState("");
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    id: number;
    label: string;
    currentStatus: string;
    nextStatus: string;
  } | null>(null);
  const [editingRedeemId, setEditingRedeemId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingOne, setDeletingOne] = useState(false);
  const [toast, setToast] = useState("");
  const [exporting, setExporting] = useState(false);

  // Pending CREATE redemptions (maker-checker: not yet committed to DB)
  const [pendingCreates, setPendingCreates] = useState<PendingChangeItem[]>([]);
  const [viewingCreate, setViewingCreate] = useState<{
    item: PendingChangeItem;
    detail: PendingChangeDetail;
  } | null>(null);
  const [viewingCreateLoading, setViewingCreateLoading] = useState(false);
  const [cancellingCreateId, setCancellingCreateId] = useState<number | null>(
    null,
  );
  const [createEditMode, setCreateEditMode] = useState(false);
  const [createEditUnits, setCreateEditUnits] = useState("");
  const [createEditDate, setCreateEditDate] = useState("");
  const [createEditPreview, setCreateEditPreview] =
    useState<RedemptionCalculationPreview | null>(null);
  const [createEditPreviewLoading, setCreateEditPreviewLoading] =
    useState(false);
  const [createEditSaving, setCreateEditSaving] = useState(false);

  const selectAllRef = useRef<HTMLInputElement>(null);

  const exportToExcel = async () => {
    setExporting(true);
    const params: QueryParams = {
      page: 1,
      pageSize: 100000,
      sortOn,
      sortDirection,
    };
    const encodedStatus = encodeMultiFilterValue(status);
    if (encodedStatus) params.status = encodedStatus;
    if (search) params.search = search;
    if (from) params.from = from;
    if (to) params.to = to;
    const r = await adminApi.redemptions(params);
    if (r.success) {
      const headers = [
        "ID",
        "App ID",
        "Investor",
        "Account User",
        "Email",
        "Type",
        "Units to Redeem",
        "Total Units",
        "Capital Redeemed",
        "Income",
        "Net Amount",
        "Status",
        "Effective Date",
        "Created",
      ];
      const rows = r.data.items.map((a) => [
        a.id,
        a.trancheApplicationId ? `#${a.trancheApplicationId}` : "",
        a.sellingPartnerName ?? "",
        a.accountUserName ?? "",
        a.email ?? "",
        a.investorType,
        a.unitsToRedeem ?? "",
        a.totalUnitsOwned ?? "",
        capitalRedeemed(a).toFixed(2),
        income(a).toFixed(2),
        a.netAggregatePrice ?? "",
        a.status,
        a.effectiveDate ? formatShortDate(a.effectiveDate) : "",
        formatShortDate(a.createdOn),
      ]);
      downloadCsv([headers, ...rows], "redemptions.csv");
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
    if (from) params.from = from;
    if (to) params.to = to;
    adminApi
      .redemptions(params)
      .then((r) => {
        if (r.success) {
          setResult(r.data);
          const ids = r.data.items.map((x) => x.id);
          if (ids.length > 0) {
            adminApi
              .getActivePendingForRecords("Redemption", ids)
              .then((pr) => {
                if (pr.success) {
                  const map: Record<number, PendingChangeItem> = {};
                  pr.data.forEach((p) => {
                    if (p.entityId) map[p.entityId] = p;
                  });
                  setPendingMap(map);
                }
              });
          } else setPendingMap({});
        }
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, status, search, from, to, sortOn, sortDirection]);

  const loadPendingCreates = useCallback(async () => {
    const r = await adminApi.getPendingChanges({
      entityType: "Redemption",
      pageSize: 100,
    });
    if (r.success) {
      setPendingCreates(
        r.data.items.filter(
          (p) =>
            p.operationType === "Create" &&
            (p.status === "Pending" || p.status === "Checked"),
        ),
      );
    }
  }, []);

  const updateRowStatus = async (
    redemption: RedemptionListItem,
    nextStatus: string,
  ) => {
    if (nextStatus === redemption.status) return;
    setStatusUpdatingId(redemption.id);
    setStatusErrorId(null);
    setStatusError("");
    const r = await adminApi.updateRedemptionStatus(redemption.id, nextStatus);
    if (r.success) {
      setResult((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === redemption.id
                  ? { ...item, status: nextStatus }
                  : item,
              ),
            }
          : prev,
      );
    } else {
      setStatusErrorId(redemption.id);
      setStatusError(r.message || "Failed to update status.");
    }
    setStatusUpdatingId(null);
  };

  const requestRowStatusChange = (
    redemption: RedemptionListItem,
    nextStatus: string,
  ) => {
    if (nextStatus === redemption.status) return;
    setPendingStatusChange({
      id: redemption.id,
      label: redemption.sellingPartnerName || redemption.accountUserName || "",
      currentStatus: redemption.status,
      nextStatus,
    });
  };

  const confirmRowStatusChange = async () => {
    if (!pendingStatusChange || !result) return;
    const redemption = result.items.find(
      (item) => item.id === pendingStatusChange.id,
    );
    if (!redemption) {
      setPendingStatusChange(null);
      return;
    }
    await updateRowStatus(redemption, pendingStatusChange.nextStatus);
    setPendingStatusChange(null);
  };

  const openViewCreate = async (item: PendingChangeItem) => {
    setViewingCreateLoading(true);
    setCreateEditMode(false);
    setCreateEditPreview(null);
    const r = await adminApi.getPendingChange(item.id);
    if (r.success) {
      setViewingCreate({ item, detail: r.data });
      const payload: CreateRedemptionAdminRequest = JSON.parse(
        r.data.payloadJson,
      );
      setCreateEditUnits(payload.unitsToRedeem ?? "");
      setCreateEditDate(payload.effectiveDate ?? "");
    }
    setViewingCreateLoading(false);
  };

  const cancelPendingCreate = async (id: number) => {
    setCancellingCreateId(id);
    const r = await adminApi.cancelChange(id);
    if (r.success) {
      setPendingCreates((prev) => prev.filter((p) => p.id !== id));
      if (viewingCreate?.item.id === id) setViewingCreate(null);
      setToast("Redemption request cancelled successfully.");
    } else {
      alert(r.message || "Failed to cancel request.");
    }
    setCancellingCreateId(null);
  };

  const saveCreateEdit = async () => {
    if (!viewingCreate || !createEditPreview) return;
    setCreateEditSaving(true);
    const payload: CreateRedemptionAdminRequest = JSON.parse(
      viewingCreate.detail.payloadJson,
    );
    const updatedDto: CreateRedemptionAdminRequest = {
      ...payload,
      unitsToRedeem: createEditUnits,
      effectiveDate: createEditDate,
      aggregatePurchasePrice: String(createEditPreview.aggregatePurchasePrice),
      proratedPreferredReturn: String(
        createEditPreview.proratedPreferredReturn,
      ),
      distributionClawback: String(createEditPreview.distributionClawback),
      netAggregatePrice: String(createEditPreview.netAggregatePrice),
      totalUnitsOwned: String(createEditPreview.totalUnits),
    };
    const r = await adminApi.createRedemption(updatedDto);
    if (r.success) {
      setViewingCreate(null);
      loadPendingCreates();
      setToast(
        "Submission updated — previous request replaced with updated values.",
      );
    } else {
      alert(r.message || "Failed to update submission.");
    }
    setCreateEditSaving(false);
  };

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadPendingCreates();
  }, [loadPendingCreates]);

  // Recalculate preview when editing a pending create
  useEffect(() => {
    if (!createEditMode || !viewingCreate) return;
    const payload: CreateRedemptionAdminRequest = JSON.parse(
      viewingCreate.detail.payloadJson,
    );
    const trancheId = payload.trancheApplicationId;
    const units = parseInt(createEditUnits);
    if (!trancheId || !units || units <= 0 || !createEditDate) {
      setCreateEditPreview(null);
      return;
    }
    setCreateEditPreviewLoading(true);
    const timer = setTimeout(async () => {
      const r = await adminApi.getRedemptionPreview(
        trancheId,
        units,
        createEditDate,
      );
      if (r.success) setCreateEditPreview(r.data);
      setCreateEditPreviewLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [createEditMode, createEditUnits, createEditDate, viewingCreate]);

  useEffect(() => {
    if (!selectAllRef.current || !result) return;
    const pageIds = result.items.map((r) => r.id);
    const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
    selectAllRef.current.indeterminate =
      selectedOnPage > 0 && selectedOnPage < pageIds.length;
  }, [selected, result]);

  const toggleSelectAll = () => {
    if (!result) return;
    const pageIds = result.items.map((r) => r.id);
    const allSelected = pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    const r = await adminApi.bulkDeleteRedemptions(Array.from(selected));
    if (r.success) {
      setSelected(new Set());
      setShowDeleteConfirm(false);
      if (isSuperAdmin) load();
      else alert(`Change submitted for approval — ${r.message}`);
    } else {
      alert(r.message || "Delete failed.");
    }
    setDeleting(false);
  };

  const handleDeleteOne = async () => {
    if (!confirmDeleteId) return;
    setDeletingOne(true);
    const r = await adminApi.deleteRedemption(confirmDeleteId);
    if (r.success) {
      setConfirmDeleteId(null);
      if (isSuperAdmin) load();
      else {
        setToast(`Delete request submitted for approval — ${r.message}`);
        load();
      }
    } else alert(r.message || "Delete failed.");
    setDeletingOne(false);
  };

  const pageIds = result?.items.map((r) => r.id) ?? [];
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  return (
    <AdminLayout>
      <div className="page-content">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0e3416" }}>
            Redemption Requests
          </h1>
          {selected.size > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                padding: "9px 18px",
                background: "#b91c1c",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Delete Selected ({selected.size})
            </button>
          )}
        </div>

        {toast && (
          <div
            style={{
              background: "#fffbeb",
              border: "1.5px solid #fbbf24",
              borderRadius: 8,
              padding: "12px 16px",
              marginBottom: 20,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 13, color: "#92400e", fontWeight: 600 }}>
              ⏳ {toast}
            </span>
            <button
              onClick={() => setToast("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#94a3b8",
                fontSize: 16,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Pending CREATE redemptions — maker-submitted, not yet approved */}
        {pendingCreates.length > 0 && (
          <div
            style={{
              marginBottom: 20,
              padding: "14px 18px",
              background: "#fffbeb",
              border: "1.5px solid #f59e0b",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  padding: "3px 10px",
                  background: "#f59e0b",
                  color: "#fff",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {pendingCreates.length} Pending
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0f2342" }}>
                Redemption submissions awaiting checker/approver approval
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pendingCreates.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    background: "white",
                    borderRadius: 8,
                    border: "1px solid #fde68a",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      padding: "2px 8px",
                      background:
                        p.status === "Checked" ? "#d1fae5" : "#fef3c7",
                      color: p.status === "Checked" ? "#065f46" : "#92400e",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {p.status}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#0f2342",
                      minWidth: 160,
                    }}
                  >
                    {p.description}
                  </span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    by <strong>{p.makerName}</strong>
                  </span>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    {formatShortDate(p.createdOn)}
                  </span>
                  <button
                    onClick={() => openViewCreate(p)}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#b8923a",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px 8px",
                    }}
                  >
                    View / Edit
                  </button>
                  {p.status === "Pending" && (
                    <button
                      onClick={() => cancelPendingCreate(p.id)}
                      disabled={cancellingCreateId === p.id}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#b91c1c",
                        background: "none",
                        border: "none",
                        cursor:
                          cancellingCreateId === p.id
                            ? "not-allowed"
                            : "pointer",
                        padding: "4px 8px",
                        opacity: cancellingCreateId === p.id ? 0.6 : 1,
                      }}
                    >
                      {cancellingCreateId === p.id ? "Cancelling…" : "Cancel"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            placeholder="Search by investor, account user, or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{
              flex: "1 1 220px",
              padding: "10px 14px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
            }}
          />
          <MultiSelectFilter
            allLabel="All Statuses"
            buttonLabel="Status"
            options={STATUSES.map((item) => ({
              value: item.label,
              label: item.value,
            }))}
            selectedValues={status}
            onChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
            minWidth={180}
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
              flex: "1 1 140px",
              padding: "10px 14px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
            }}
            title="From date"
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
              flex: "1 1 140px",
              padding: "10px 14px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
            }}
            title="To date"
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
          {(hasMultiFilterValue(status) || search || from || to) && (
            <button
              onClick={() => {
                setStatus([]);
                setSearch("");
                setFrom("");
                setTo("");
                setPage(1);
              }}
              style={{
                padding: "10px 14px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 14,
                background: "white",
                cursor: "pointer",
                color: "#64748b",
              }}
            >
              Reset
            </button>
          )}
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 32, color: "#64748b" }}>Loading...</div>
          ) : result ? (
            <>
              <div className="table-scroll">
                <table style={{ minWidth: 1360 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 40, padding: "12px 8px 12px 16px" }}>
                        <input
                          type="checkbox"
                          ref={selectAllRef}
                          checked={allPageSelected}
                          onChange={toggleSelectAll}
                          style={{ cursor: "pointer" }}
                        />
                      </th>
                      <SortableTh
                        label="ID"
                        sortKey="id"
                        sortOn={sortOn}
                        sortDirection={sortDirection}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Effective Date"
                        sortKey="effectiveDate"
                        sortOn={sortOn}
                        sortDirection={sortDirection}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Account User"
                        sortKey="accountUserName"
                        sortOn={sortOn}
                        sortDirection={sortDirection}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Investor"
                        sortKey="sellingPartnerName"
                        sortOn={sortOn}
                        sortDirection={sortDirection}
                        onSort={toggleSort}
                      />

                      <SortableTh
                        label="Type"
                        sortKey="investorType"
                        sortOn={sortOn}
                        sortDirection={sortDirection}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Units to Redeem"
                        sortKey="unitsToRedeem"
                        sortOn={sortOn}
                        sortDirection={sortDirection}
                        onSort={toggleSort}
                      />
                      {/* <SortableTh
                        label="Total Units Owned"
                        sortKey="totalUnitsOwned"
                        sortOn={sortOn}
                        sortDirection={sortDirection}
                        onSort={toggleSort}
                      /> */}
                      <SortableTh
                        label="Capital Redeemed"
                        sortKey="capitalRedeemed"
                        sortOn={sortOn}
                        sortDirection={sortDirection}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Income"
                        sortKey="proratedPreferredReturn"
                        sortOn={sortOn}
                        sortDirection={sortDirection}
                        onSort={toggleSort}
                      />
                      {/* <SortableTh
                        label="App ID"
                        sortKey="applicationId"
                        sortOn={sortOn}
                        sortDirection={sortDirection}
                        onSort={toggleSort}
                      /> */}
                      <SortableTh
                        label="Status"
                        sortKey="status"
                        sortOn={sortOn}
                        sortDirection={sortDirection}
                        onSort={toggleSort}
                      />
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={13}
                          style={{
                            textAlign: "center",
                            color: "#94a3b8",
                            padding: 32,
                          }}
                        >
                          No redemption requests found
                        </td>
                      </tr>
                    ) : (
                      result.items.map((r) => (
                        <tr
                          key={r.id}
                          style={{
                            background: selected.has(r.id)
                              ? "#fff7ed"
                              : undefined,
                          }}
                          onClick={() => route.push(`/redemptions/${r.id}`)}
                        >
                          <td style={{ padding: "12px 8px 12px 16px" }}>
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggleOne(r.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          <td
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 700,
                              color: "#b8923a",
                            }}
                          >
                            #{r.id}
                          </td>

                          <td style={{ fontSize: 13, color: "#64748b" }}>
                            {r.effectiveDate
                              ? formatShortDate(r.effectiveDate)
                              : "—"}
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {r.sellingPartnerName ?? "—"}
                          </td>
                          <td>
                            {r.accountUserName && r.accountUserId ? (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  route.push(
                                    `/investor-statements?userId=${r.accountUserId}`,
                                  );
                                }}
                                style={{
                                  cursor: "pointer",
                                  color: "#1e293b",
                                  fontWeight: 600,
                                  textDecoration: "underline",
                                }}
                                title="Open Investor Statement"
                              >
                                {r.accountUserName}
                              </div>
                            ) : (
                              <div style={{ color: "#1e293b" }}>
                                {r.accountUserName ?? "—"}
                              </div>
                            )}
                            {r.email && (
                              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                                {r.email}
                              </div>
                            )}
                          </td>
                          <td>{r.investorType}</td>
                          <td
                            style={{
                              fontWeight: 700,
                              color: "#0e3416",
                              textAlign: "center",
                            }}
                          >
                            {r.unitsToRedeem ?? "—"}
                          </td>
                          <td style={{ fontWeight: 600, color: "#0e3416" }}>
                            {r.aggregatePurchasePrice
                              ? fmtMoney(capitalRedeemed(r))
                              : "—"}
                          </td>
                          <td style={{ fontWeight: 600, color: "#b45309" }}>
                            {r.proratedPreferredReturn
                              ? `+${fmtMoney(income(r))}`
                              : "—"}
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                gap: 6,
                              }}
                            >
                              <EditableStatusBadge
                                status={r.status}
                                options={Array.from(
                                  new Set([...STATUS_OPTIONS]),
                                )}
                                disabled={statusUpdatingId === r.id}
                                onChange={(nextStatus) => {
                                  if (statusErrorId === r.id) {
                                    setStatusErrorId(null);
                                    setStatusError("");
                                  }
                                  requestRowStatusChange(r, nextStatus);
                                }}
                              />
                              {statusUpdatingId === r.id && (
                                <span
                                  style={{ fontSize: 12, color: "#64748b" }}
                                >
                                  Saving...
                                </span>
                              )}
                              {statusErrorId === r.id && (
                                <span
                                  style={{ fontSize: 12, color: "#b91c1c" }}
                                >
                                  {statusError}
                                </span>
                              )}
                              {pendingMap[r.id] && (
                                <PendingBadge item={pendingMap[r.id]} />
                              )}
                            </div>
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                                alignItems: "flex-start",
                              }}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(r.id);
                                }}
                                style={{
                                  fontSize: 13,
                                  color: "#b91c1c",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  fontWeight: 600,
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <PaginationControls
                page={page}
                totalPages={result.totalPages}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={(next) => {
                  setPage(1);
                  setPageSize(next);
                }}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                summary={
                  <>
                    {result.totalCount} requests
                    {selected.size > 0 && (
                      <span
                        style={{
                          marginLeft: 12,
                          color: "#b8923a",
                          fontWeight: 600,
                        }}
                      >
                        {selected.size} selected
                      </span>
                    )}
                  </>
                }
                containerStyle={{
                  padding: "16px 20px",
                  borderTop: "1px solid #f1f5f9",
                }}
                buttonClassName="btn-secondary"
                buttonStyle={{ padding: "8px 16px", fontSize: 13 }}
              />
            </>
          ) : (
            <div style={{ padding: 32, color: "#ef4444" }}>
              Failed to load redemptions.
            </div>
          )}
        </div>
      </div>

      {/* Bulk delete confirmation modal */}
      {showDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 32,
              width: 420,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h2
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: "#0f2342",
                marginBottom: 10,
              }}
            >
              Delete {selected.size} Redemption{selected.size !== 1 ? "s" : ""}?
            </h2>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 6 }}>
              This will permanently delete the selected redemption records.
            </p>
            <p
              style={{
                fontSize: 13,
                color: "#b91c1c",
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              This cannot be undone.
            </p>
            <div
              style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}
            >
              <button
                className="btn-secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: "10px 20px",
                  background: "#b91c1c",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single-record delete confirmation modal */}
      {confirmDeleteId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 32,
              width: 420,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h2
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: "#0f2342",
                marginBottom: 10,
              }}
            >
              Delete Redemption #{confirmDeleteId}?
            </h2>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 6 }}>
              This will permanently delete the redemption record.
            </p>
            <p
              style={{
                fontSize: 13,
                color: "#b91c1c",
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              This cannot be undone.
            </p>
            <div
              style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}
            >
              <button
                className="btn-secondary"
                onClick={() => setConfirmDeleteId(null)}
                disabled={deletingOne}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteOne}
                disabled={deletingOne}
                style={{
                  padding: "10px 20px",
                  background: "#b91c1c",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: deletingOne ? "not-allowed" : "pointer",
                  opacity: deletingOne ? 0.7 : 1,
                }}
              >
                {deletingOne ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingStatusChange && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 32,
              width: 420,
              maxWidth: "90vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h2
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: "#0f2342",
                marginBottom: 10,
              }}
            >
              Change redemption status?
            </h2>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 8 }}>
              {pendingStatusChange.label ||
                `Redemption #${pendingStatusChange.id}`}
            </p>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 20 }}>
              Change status from{" "}
              <strong>{pendingStatusChange.currentStatus}</strong> to{" "}
              <strong>{pendingStatusChange.nextStatus}</strong>?
            </p>
            <div
              style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}
            >
              <button
                className="btn-secondary"
                onClick={() => setPendingStatusChange(null)}
                disabled={statusUpdatingId === pendingStatusChange.id}
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmRowStatusChange()}
                disabled={statusUpdatingId === pendingStatusChange.id}
                style={{
                  padding: "10px 20px",
                  background: "#0f9444",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor:
                    statusUpdatingId === pendingStatusChange.id
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    statusUpdatingId === pendingStatusChange.id ? 0.7 : 1,
                }}
              >
                {statusUpdatingId === pendingStatusChange.id
                  ? "Saving..."
                  : "Confirm Change"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending CREATE view/edit modal */}
      {viewingCreateLoading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 32,
              color: "#64748b",
              fontSize: 15,
            }}
          >
            Loading submission details…
          </div>
        </div>
      )}
      {viewingCreate &&
        (() => {
          const payload: CreateRedemptionAdminRequest = JSON.parse(
            viewingCreate.detail.payloadJson,
          );
          const isEditable = viewingCreate.item.status === "Pending";
          return (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: "20px",
              }}
            >
              <div
                style={{
                  background: "white",
                  borderRadius: 12,
                  width: "100%",
                  maxWidth: 680,
                  maxHeight: "90vh",
                  overflowY: "auto",
                  padding: "28px 32px",
                  boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#0f2342",
                        margin: 0,
                      }}
                    >
                      Pending Submission #{viewingCreate.item.id}
                    </h2>
                    <p
                      style={{
                        fontSize: 13,
                        color: "#64748b",
                        marginTop: 4,
                        marginBottom: 0,
                      }}
                    >
                      {viewingCreate.item.description}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setViewingCreate(null);
                      setCreateEditMode(false);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#94a3b8",
                      fontSize: 22,
                      lineHeight: 1,
                      padding: 0,
                      marginLeft: 12,
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* Status + timeline */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 20,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      padding: "3px 10px",
                      background:
                        viewingCreate.item.status === "Checked"
                          ? "#d1fae5"
                          : "#fef3c7",
                      color:
                        viewingCreate.item.status === "Checked"
                          ? "#065f46"
                          : "#92400e",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {viewingCreate.item.status}
                  </span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    Submitted by <strong>{viewingCreate.item.makerName}</strong>{" "}
                    on {formatShortDateTime(viewingCreate.item.createdOn)}
                  </span>
                  {viewingCreate.item.checkerName && (
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      · Reviewed by{" "}
                      <strong>{viewingCreate.item.checkerName}</strong>
                    </span>
                  )}
                </div>

                {/* Read-only investor details */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px 24px",
                    marginBottom: 18,
                  }}
                >
                  {(
                    [
                      ["Partner Name", payload.sellingPartnerName],
                      ["Investor Type", payload.investorType],
                      ["Email", payload.email],
                      [
                        "Tranche App ID",
                        payload.trancheApplicationId
                          ? `#${payload.trancheApplicationId}`
                          : undefined,
                      ],
                      ["Original Purchase Date", payload.originalPurchaseDate],
                      ["Status on Submit", payload.status],
                    ] as [string, string | undefined][]
                  )
                    .filter(([, v]) => v)
                    .map(([label, value]) => (
                      <div key={label}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            color: "#94a3b8",
                            letterSpacing: "0.05em",
                            marginBottom: 2,
                          }}
                        >
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#1a1a2e",
                            fontWeight: 500,
                          }}
                        >
                          {value}
                        </div>
                      </div>
                    ))}
                </div>

                {/* Redemption figures */}
                {!createEditMode && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "10px 16px",
                      padding: "14px",
                      background: "#f0fdf4",
                      border: "1px solid #a7f3d0",
                      borderRadius: 8,
                      marginBottom: 20,
                    }}
                  >
                    {(
                      [
                        ["Units to Redeem", payload.unitsToRedeem],
                        ["Total Units Owned", payload.totalUnitsOwned],
                        ["Effective Date", payload.effectiveDate],
                        [
                          "Aggregate Price",
                          payload.aggregatePurchasePrice
                            ? `$${parseFloat(payload.aggregatePurchasePrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : undefined,
                        ],
                        [
                          "Preferred Return",
                          payload.proratedPreferredReturn
                            ? `$${parseFloat(payload.proratedPreferredReturn).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : undefined,
                        ],
                        [
                          "Clawback",
                          payload.distributionClawback
                            ? `$${parseFloat(payload.distributionClawback).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : undefined,
                        ],
                        [
                          "Net Price",
                          payload.netAggregatePrice
                            ? `$${parseFloat(payload.netAggregatePrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : undefined,
                        ],
                      ] as [string, string | undefined][]
                    )
                      .filter(([, v]) => v)
                      .map(([label, value]) => (
                        <div key={label}>
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              color: "#059669",
                              letterSpacing: "0.05em",
                              marginBottom: 2,
                            }}
                          >
                            {label}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#065f46",
                            }}
                          >
                            {value}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Edit section */}
                {createEditMode && isEditable && (
                  <div
                    style={{
                      padding: "16px",
                      background: "#f8fafc",
                      borderRadius: 8,
                      border: "1.5px solid #e2e8f0",
                      marginBottom: 20,
                    }}
                  >
                    <h3
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#0f2342",
                        marginBottom: 14,
                        marginTop: 0,
                      }}
                    >
                      Edit Submission Values
                    </h3>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                        marginBottom: 14,
                      }}
                    >
                      <div>
                        <label
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#64748b",
                            display: "block",
                            marginBottom: 4,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          Units to Redeem
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={createEditUnits}
                          onChange={(e) => {
                            setCreateEditUnits(e.target.value);
                            setCreateEditPreview(null);
                          }}
                          style={{
                            width: "100%",
                            padding: "9px 12px",
                            border: "1.5px solid #e2e8f0",
                            borderRadius: 8,
                            fontSize: 14,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#64748b",
                            display: "block",
                            marginBottom: 4,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          Effective Date
                        </label>
                        <input
                          type="date"
                          value={createEditDate}
                          onChange={(e) => {
                            setCreateEditDate(e.target.value);
                            setCreateEditPreview(null);
                          }}
                          style={{
                            width: "100%",
                            padding: "9px 12px",
                            border: "1.5px solid #e2e8f0",
                            borderRadius: 8,
                            fontSize: 14,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>
                    {createEditPreviewLoading && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#64748b",
                          marginBottom: 12,
                        }}
                      >
                        Calculating…
                      </div>
                    )}
                    {createEditPreview && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: "8px 14px",
                          padding: "12px",
                          background: "#ecfdf5",
                          border: "1px solid #a7f3d0",
                          borderRadius: 8,
                          marginBottom: 14,
                        }}
                      >
                        {(
                          [
                            [
                              "Aggregate Price",
                              `$${createEditPreview.aggregatePurchasePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                            ],
                            [
                              "Preferred Return",
                              `$${createEditPreview.proratedPreferredReturn.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                            ],
                            [
                              "Clawback",
                              `$${createEditPreview.distributionClawback.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                            ],
                            [
                              "Net Price",
                              `$${createEditPreview.netAggregatePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                            ],
                            [
                              "Days Invested",
                              String(createEditPreview.daysInvested),
                            ],
                            [
                              "Short Term",
                              createEditPreview.isShortTerm ? "Yes" : "No",
                            ],
                          ] as [string, string][]
                        ).map(([label, value]) => (
                          <div key={label}>
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#059669",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                marginBottom: 2,
                              }}
                            >
                              {label}
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "#065f46",
                              }}
                            >
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        onClick={saveCreateEdit}
                        disabled={createEditSaving || !createEditPreview}
                        style={{
                          padding: "9px 20px",
                          background: "#b8923a",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor:
                            createEditSaving || !createEditPreview
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            createEditSaving || !createEditPreview ? 0.6 : 1,
                        }}
                      >
                        {createEditSaving
                          ? "Saving…"
                          : "Save & Replace Submission"}
                      </button>
                      <button
                        onClick={() => {
                          setCreateEditMode(false);
                          setCreateEditPreview(null);
                        }}
                        style={{
                          padding: "9px 16px",
                          background: "#f1f5f9",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#475569",
                          cursor: "pointer",
                        }}
                      >
                        Discard Changes
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    justifyContent: "flex-end",
                    borderTop: "1px solid #f1f5f9",
                    paddingTop: 18,
                    marginTop: 4,
                    flexWrap: "wrap",
                  }}
                >
                  {isEditable && !createEditMode && (
                    <button
                      onClick={() => setCreateEditMode(true)}
                      style={{
                        padding: "9px 18px",
                        background: "#0f2342",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Edit Submission
                    </button>
                  )}
                  {isEditable && !createEditMode && (
                    <button
                      onClick={() => cancelPendingCreate(viewingCreate.item.id)}
                      disabled={cancellingCreateId === viewingCreate.item.id}
                      style={{
                        padding: "9px 16px",
                        background: "#fef2f2",
                        border: "1.5px solid #fecaca",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#b91c1c",
                        cursor: cancellingCreateId ? "not-allowed" : "pointer",
                        opacity: cancellingCreateId ? 0.7 : 1,
                      }}
                    >
                      {cancellingCreateId === viewingCreate.item.id
                        ? "Cancelling…"
                        : "Cancel Request"}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setViewingCreate(null);
                      setCreateEditMode(false);
                    }}
                    style={{
                      padding: "9px 16px",
                      background: "#f1f5f9",
                      border: "1.5px solid #e2e8f0",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#475569",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </AdminLayout>
  );
}
