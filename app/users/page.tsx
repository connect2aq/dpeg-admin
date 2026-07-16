"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { PaginationControls } from "@/components/PaginationControls";
import { EditableStatusBadge } from "@/components/StatusBadge";
import { SortableTh } from "@/components/SortableTh";
import {
  adminApi,
  type UserListItem,
  type PagedResult,
  type CreateUserAdminRequest,
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
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const STATUSES = [
  "InProgress",
  "UnderReview",
  "Active",
  "Inactive",
  "Test",
  "NeverApplied",
  "HasDeposit",
  "HasActiveInvestment",
  "AwaitingApproval",
  "LatestRejected",
];
const STATUS_OPTIONS = ["InProgress", "UnderReview", "Active", "Inactive"];
const STATUS_LABELS: Record<string, string> = {
  InProgress: "In Progress",
  UnderReview: "Under Review",
  Test: "Test Users",
  NeverApplied: "Never Applied",
  HasDeposit: "Total Depositors (Active/Redeemed)",
  HasActiveInvestment: "Active Depositors",
  AwaitingApproval: "Awaiting Approval (Unconverted)",
  LatestRejected: "Latest App Rejected (Unconverted)",
};
const DEFAULT_PAGE_SIZE = 20;

const emptyCreateForm: CreateUserAdminRequest = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
};

export default function UsersPage() {
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
      <UsersContent />
    </Suspense>
  );
}

function UsersContent() {
  const route = useRouter();
  const { user: authUser } = useAdminAuth();
  const isSuperAdmin = (authUser?.adminRole ?? "SuperAdmin") === "SuperAdmin";
  const searchParams = useSearchParams();
  const [result, setResult] = useState<PagedResult<UserListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string[]>(() => {
    const filter = searchParams.get("filter");
    if (filter === "neverApplied") return ["NeverApplied"];
    if (filter === "hasDeposit") return ["HasDeposit"];
    if (filter === "hasActiveInvestment") return ["HasActiveInvestment"];
    if (filter === "awaitingApproval") return ["AwaitingApproval"];
    if (filter === "latestRejected") return ["LatestRejected"];
    return parseMultiFilterValue(searchParams.get("status"));
  });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
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
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
  const [statusErrorId, setStatusErrorId] = useState<number | null>(null);
  const [statusError, setStatusError] = useState("");
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    id: number;
    label: string;
    currentStatus: string;
    nextStatus: string;
  } | null>(null);
  const [viewMode, setViewMode] = useState<"investors" | "admins">("investors");
  const [exporting, setExporting] = useState(false);

  // Multi-select state
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

  // Create user state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateUserAdminRequest>(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  const exportToExcel = async () => {
    setExporting(true);
    const params: QueryParams = {
      page: 1,
      pageSize: 100000,
      sortOn,
      sortDirection,
    };
    if (search) params.search = search;
    const specialFilters = [
      "Test",
      "NeverApplied",
      "HasDeposit",
      "HasActiveInvestment",
      "AwaitingApproval",
      "LatestRejected",
    ];
    const encodedStatus = encodeMultiFilterValue(
      status.filter((item) => !specialFilters.includes(item)),
    );
    if (encodedStatus) params.status = encodedStatus;
    if (viewMode === "admins") params.isAdmin = "true";
    if (status.includes("NeverApplied")) params.neverApplied = "true";
    if (status.includes("HasDeposit")) params.hasDeposit = "true";
    if (status.includes("HasActiveInvestment"))
      params.hasActiveInvestment = "true";
    if (status.includes("AwaitingApproval")) params.awaitingApproval = "true";
    if (status.includes("LatestRejected")) params.latestRejected = "true";
    const r = await adminApi.users(params);
    if (r.success) {
      const items =
        status.includes("Test")
          ? r.data.items.filter((u) => u.isTestUser)
          : r.data.items;
      if (viewMode === "investors") {
        const headers = [
          "ID",
          "First Name",
          "Last Name",
          "Email",
          "Status",
          "Email Verified",
          "Onboarding Step",
          "Applications",
          "Test User",
          "Registered",
        ];
        const rows = items.map((u) => [
          u.id,
          u.firstName,
          u.lastName,
          u.email,
          u.status,
          u.emailVerified ? "Yes" : "No",
          `${u.currentOnboardingStep}/7`,
          u.applicationCount,
          u.isTestUser ? "Yes" : "No",
          formatShortDate(u.createdOn),
        ]);
        downloadCsv([headers, ...rows], "users.csv");
      } else {
        const headers = [
          "ID",
          "First Name",
          "Last Name",
          "Email",
          "Status",
          "Admin Role",
          "Registered",
        ];
        const rows = items.map((u) => [
          u.id,
          u.firstName,
          u.lastName,
          u.email,
          u.status,
          u.adminRole ?? "",
          formatShortDate(u.createdOn),
        ]);
        downloadCsv([headers, ...rows], "admin-users.csv");
      }
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
    if (search) params.search = search;
    const specialFilters = [
      "Test",
      "NeverApplied",
      "HasDeposit",
      "HasActiveInvestment",
      "AwaitingApproval",
      "LatestRejected",
    ];
    const encodedStatus = encodeMultiFilterValue(
      status.filter((item) => !specialFilters.includes(item)),
    );
    if (encodedStatus) params.status = encodedStatus;
    if (viewMode === "admins") params.isAdmin = "true";
    if (status.includes("NeverApplied")) params.neverApplied = "true";
    if (status.includes("HasDeposit")) params.hasDeposit = "true";
    if (status.includes("HasActiveInvestment"))
      params.hasActiveInvestment = "true";
    if (status.includes("AwaitingApproval")) params.awaitingApproval = "true";
    if (status.includes("LatestRejected")) params.latestRejected = "true";
    adminApi
      .users(params)
      .then((r) => {
        if (r.success) {
          const items =
            status.includes("Test")
              ? r.data.items.filter((u) => u.isTestUser)
              : r.data.items;
          setResult({ ...r.data, items });
        }
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, search, status, viewMode, sortOn, sortDirection]);

  useEffect(() => {
    load();
  }, [load]);

  const switchView = (mode: "investors" | "admins") => {
    setViewMode(mode);
    setPage(1);
    setSelected(new Set());
  };

  const updateRowStatus = async (u: UserListItem, nextStatus: string) => {
    if (nextStatus === u.status) return;
    setStatusUpdatingId(u.id);
    setStatusErrorId(null);
    setStatusError("");
    const r = await adminApi.updateUserStatus(u.id, nextStatus);
    if (r.success) {
      setResult((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === u.id ? { ...item, status: nextStatus } : item,
              ),
            }
          : prev,
      );
    } else {
      setStatusErrorId(u.id);
      setStatusError(r.message || "Failed to update status.");
    }
    setStatusUpdatingId(null);
  };

  const requestRowStatusChange = (u: UserListItem, nextStatus: string) => {
    if (nextStatus === u.status) return;
    setPendingStatusChange({
      id: u.id,
      label: `${u.firstName} ${u.lastName}`.trim() || u.email,
      currentStatus: u.status,
      nextStatus,
    });
  };

  const confirmRowStatusChange = async () => {
    if (!pendingStatusChange || !result) return;
    const user = result.items.find((item) => item.id === pendingStatusChange.id);
    if (!user) {
      setPendingStatusChange(null);
      return;
    }
    await updateRowStatus(user, pendingStatusChange.nextStatus);
    setPendingStatusChange(null);
  };

  const toggleTestUser = async (u: UserListItem) => {
    const newVal = !u.isTestUser;
    setTogglingId(u.id);
    const r = await adminApi.setUserIsTest(u.id, newVal);
    if (r.success) {
      setResult((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === u.id ? { ...item, isTestUser: newVal } : item,
              ),
            }
          : prev,
      );
    }
    setTogglingId(null);
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!result) return;
    const allIds = result.items.map((u) => u.id);
    const allSelected = allIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        allIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteMsg("");
    const r = await adminApi.bulkDeleteUsers(Array.from(selected));
    if (r.success) {
      setSelected(new Set());
      setShowDeleteConfirm(false);
      if (isSuperAdmin) load();
      else setDeleteMsg(`Change submitted for approval — ${r.message}`);
    } else {
      setDeleteMsg(r.message || "Delete failed.");
    }
    setDeleting(false);
  };

  const submitCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateMsg("");
    const r = await adminApi.createUser(createForm);
    if (r.success) {
      setShowCreateModal(false);
      setCreateForm(emptyCreateForm);
      load();
    } else {
      setCreateMsg(r.message || "Failed to create user.");
    }
    setCreating(false);
  };

  const allOnPageSelected = result
    ? result.items.length > 0 && result.items.every((u) => selected.has(u.id))
    : false;
  const someOnPageSelected = result
    ? result.items.some((u) => selected.has(u.id))
    : false;

  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px" }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#0e3416",
            marginBottom: 16,
          }}
        >
          Users
        </h1>

        {/* View toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["investors", "admins"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => switchView(mode)}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 8,
                cursor: "pointer",
                border:
                  viewMode === mode
                    ? "1.5px solid #0e3416"
                    : "1.5px solid #e2e8f0",
                background: viewMode === mode ? "#0e3416" : "white",
                color: viewMode === mode ? "white" : "#64748b",
              }}
            >
              {mode === "investors" ? "Investors" : "Admin Users"}
            </button>
          ))}
        </div>

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
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            style={{
              flex: "1 1 250px",
              padding: "10px 14px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
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
              flex: "1 1 140px",
              padding: "10px 14px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
            }}
            placeholder="From date"
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
          <MultiSelectFilter
            allLabel="All Statuses"
            buttonLabel="Status"
            options={STATUSES.map((item) => ({
              value: item,
              label: STATUS_LABELS[item] ?? item,
            }))}
            selectedValues={status}
            onChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
            minWidth={220}
          />
          {(search || from || to || hasMultiFilterValue(status)) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFrom("");
                setTo("");
                setStatus([]);
                setPage(1);
                setSelected(new Set());
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
          <button
            type="button"
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
        </div>

        {/* Action toolbar */}
        {viewMode === "investors" && (
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 16,
              alignItems: "center",
            }}
          >
            <button
              className="btn-primary"
              onClick={() => {
                setCreateForm(emptyCreateForm);
                setCreateMsg("");
                setShowCreateModal(true);
              }}
              style={{ fontSize: 13 }}
            >
              + Create User
            </button>
            {selected.size > 0 && (
              <button
                onClick={() => {
                  setDeleteMsg("");
                  setShowDeleteConfirm(true);
                }}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 6,
                  background: "#fee2e2",
                  color: "#b91c1c",
                  border: "1.5px solid #fca5a5",
                  cursor: "pointer",
                }}
              >
                Delete Selected ({selected.size})
              </button>
            )}
          </div>
        )}
        {viewMode === "admins" && (
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
            Admin accounts manage the portal itself (Maker / Checker / Approver
            / SuperAdmin). Click into a row to change role or reset password.
          </p>
        )}

        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 32, color: "#64748b" }}>Loading...</div>
          ) : result ? (
            <>
              <div className="table-scroll">
                <table
                  style={{ minWidth: viewMode === "investors" ? 1100 : 700 }}
                >
                  <thead>
                    <tr>
                      {viewMode === "investors" && (
                        <>
                          <th style={{ width: 40, textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={allOnPageSelected}
                              ref={(el) => {
                                if (el)
                                  el.indeterminate =
                                    someOnPageSelected && !allOnPageSelected;
                              }}
                              onChange={toggleSelectAll}
                            />
                          </th>
                          <SortableTh
                            label="Registered"
                            sortKey="createdOn"
                            sortOn={sortOn}
                            sortDirection={sortDirection}
                            onSort={toggleSort}
                          />
                        </>
                      )}
                      <SortableTh
                        label="Name"
                        sortKey="name"
                        sortOn={sortOn}
                        sortDirection={sortDirection}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Email"
                        sortKey="email"
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
                      {viewMode === "investors" ? (
                        <>
                          {/* <SortableTh
                            label="Step"
                            sortKey="step"
                            sortOn={sortOn}
                            sortDirection={sortDirection}
                            onSort={toggleSort}
                          /> */}
                          <SortableTh
                            label="Applications"
                            sortKey="applications"
                            sortOn={sortOn}
                            sortDirection={sortDirection}
                            onSort={toggleSort}
                          />
                          <SortableTh
                            label="Redemptions"
                            sortKey="redemptions"
                            sortOn={sortOn}
                            sortDirection={sortDirection}
                            onSort={toggleSort}
                          />
                          <SortableTh
                            label="Distributions"
                            sortKey="distributions"
                            sortOn={sortOn}
                            sortDirection={sortDirection}
                            onSort={toggleSort}
                          />
                        </>
                      ) : (
                        <>
                          <SortableTh
                            label="Admin Role"
                            sortKey="adminRole"
                            sortOn={sortOn}
                            sortDirection={sortDirection}
                            onSort={toggleSort}
                          />
                          <SortableTh
                            label="Registered"
                            sortKey="createdOn"
                            sortOn={sortOn}
                            sortDirection={sortDirection}
                            onSort={toggleSort}
                          />
                        </>
                      )}

                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={viewMode === "investors" ? 10 : 6}
                          style={{
                            textAlign: "center",
                            color: "#94a3b8",
                            padding: 32,
                          }}
                        >
                          No users found
                        </td>
                      </tr>
                    ) : (
                      result.items.map((u) => (
                        <tr
                          key={u.id}
                          style={{
                            cursor: "pointer",
                            background: selected.has(u.id)
                              ? "#fef9ec"
                              : undefined,
                          }}
                          onClick={() => route.push(`/users/${u.id}`)}
                        >
                          {viewMode === "investors" && (
                            <>
                              <td
                                style={{ textAlign: "center" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected.has(u.id)}
                                  onChange={() => toggleSelect(u.id)}
                                />
                              </td>
                              <td style={{ color: "#64748b", fontSize: 13 }}>
                                {formatShortDate(u.createdOn)}
                              </td>
                            </>
                          )}
                          <td style={{ fontWeight: 600 }}>
                            {u.firstName} {u.lastName}
                            {u.isTestUser && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  background: "#fef3c7",
                                  color: "#92400e",
                                  border: "1px solid #fbbf24",
                                  borderRadius: 4,
                                  padding: "1px 5px",
                                  verticalAlign: "middle",
                                }}
                              >
                                TEST
                              </span>
                            )}
                          </td>
                          <td style={{ color: "#64748b" }}>{u.email}</td>
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
                                status={u.status}
                                options={STATUS_OPTIONS}
                                disabled={statusUpdatingId === u.id}
                                onChange={(nextStatus) => {
                                  if (statusErrorId === u.id) {
                                    setStatusErrorId(null);
                                    setStatusError("");
                                  }
                                  requestRowStatusChange(u, nextStatus);
                                }}
                              />
                              {statusUpdatingId === u.id && (
                                <span
                                  style={{ fontSize: 12, color: "#64748b" }}
                                >
                                  Saving...
                                </span>
                              )}
                              {statusErrorId === u.id && (
                                <span
                                  style={{ fontSize: 12, color: "#b91c1c" }}
                                >
                                  {statusError}
                                </span>
                              )}
                            </div>
                          </td>
                          {viewMode === "investors" ? (
                            <>
                              {/* <td style={{ textAlign: "center" }}>
                                {u.currentOnboardingStep}/7
                              </td> */}
                              <td style={{ textAlign: "center" }}>
                                {u.applicationCount}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                {u.redemptionCount}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                {u.distributionCount}
                              </td>
                            </>
                          ) : (
                            <>
                              <td>
                                <span
                                  style={{
                                    padding: "2px 10px",
                                    borderRadius: 10,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.03em",
                                    background: "#e0e7ff",
                                    color: "#3730a3",
                                  }}
                                >
                                  {u.adminRole ?? "—"}
                                </span>
                              </td>
                              <td style={{ color: "#64748b", fontSize: 13 }}>
                                {formatShortDate(u.createdOn)}
                              </td>
                            </>
                          )}

                          <td>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                                alignItems: "flex-start",
                              }}
                            >
                              {viewMode === "investors" && u.isTestUser && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTestUser(u);
                                  }}
                                  disabled={togglingId === u.id}
                                  title={
                                    u.isTestUser
                                      ? "Remove test flag"
                                      : "Mark as test user"
                                  }
                                  style={{
                                    padding: "3px 8px",
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    border: "1px solid",
                                    cursor:
                                      togglingId === u.id
                                        ? "not-allowed"
                                        : "pointer",
                                    background: u.isTestUser
                                      ? "#fef3c7"
                                      : "white",
                                    borderColor: u.isTestUser
                                      ? "#fbbf24"
                                      : "#e2e8f0",
                                    color: u.isTestUser ? "#92400e" : "#94a3b8",
                                    opacity: togglingId === u.id ? 0.6 : 1,
                                  }}
                                >
                                  Test
                                </button>
                              )}
                              {viewMode === "investors" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    route.push(
                                      `/investor-statements?userId=${u.id}`,
                                    );
                                  }}
                                  title="Open Investor Statement"
                                  style={{
                                    background: "none",
                                    border: "none",
                                    padding: 0,
                                    cursor: "pointer",
                                    color: "#b8923a",
                                    fontSize: 15,
                                    textDecoration: "none",
                                    lineHeight: 1,
                                  }}
                                >
                                  📄
                                </button>
                              )}
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
                summary={`${result.totalCount} users`}
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
              Failed to load users.
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirm Modal */}
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
              maxWidth: "90vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#0f2342",
                marginBottom: 12,
              }}
            >
              Delete {selected.size} User{selected.size !== 1 ? "s" : ""}?
            </h2>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 8 }}>
              This will permanently delete the selected user
              {selected.size !== 1 ? "s" : ""} and all associated data
              (investments, redemptions, distributions, interest logs, etc.).
            </p>
            <p
              style={{
                fontSize: 13,
                color: "#b91c1c",
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              This action cannot be undone.
            </p>
            {deleteMsg && (
              <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>
                {deleteMsg}
              </p>
            )}
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
                onClick={confirmDelete}
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
                {deleting
                  ? "Processing..."
                  : isSuperAdmin
                    ? "Confirm Delete"
                    : "Submit for Approval"}
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
              Change user status?
            </h2>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 8 }}>
              {pendingStatusChange.label || `User #${pendingStatusChange.id}`}
            </p>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 20 }}>
              Change status from <strong>{pendingStatusChange.currentStatus}</strong>{" "}
              to <strong>{pendingStatusChange.nextStatus}</strong>?
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
                  opacity: statusUpdatingId === pendingStatusChange.id ? 0.7 : 1,
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

      {/* Create User Modal */}
      {showCreateModal && (
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
              width: 460,
              maxWidth: "90vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#0f2342",
                marginBottom: 20,
              }}
            >
              Create User
            </h2>
            <form onSubmit={submitCreateUser}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    First Name *
                  </label>
                  <input
                    required
                    value={createForm.firstName}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        firstName: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      border: "1.5px solid #e2e8f0",
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#475569",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    Last Name *
                  </label>
                  <input
                    required
                    value={createForm.lastName}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, lastName: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      border: "1.5px solid #e2e8f0",
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#475569",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Email *
                </label>
                <input
                  required
                  type="email"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, email: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#475569",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Password *
                </label>
                <input
                  required
                  type="password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, password: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </div>
              {createMsg && (
                <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>
                  {createMsg}
                </p>
              )}
              <div
                style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    padding: "10px 20px",
                    background: "#0e3416",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: creating ? "not-allowed" : "pointer",
                    opacity: creating ? 0.7 : 1,
                  }}
                >
                  {creating ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
