"use client";
import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { PaginationControls } from "@/components/PaginationControls";
import { SortableTh } from "@/components/SortableTh";
import { adminApi, type DailyInterestPagedResult } from "@/lib/api";
import { downloadCsv } from "@/lib/exportCsv";
import { hasMultiFilterValue } from "@/lib/filterUtils";
import type { QueryParams } from "@/lib/apiContracts";
import { formatShortDate } from "@/lib/dateFormat";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import Link from "next/link";

const DEFAULT_PAGE_SIZE = 25;

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function DailyInterestLedgerContent() {
  const searchParams = useSearchParams();
  const [result, setResult] = useState<DailyInterestPagedResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [appId, setAppId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Pre-filtered when arriving from the Dashboard's "Accrued & Unpaid" KPI tile
  // (/daily-interest-ledger?included=false).
  const [included, setIncluded] = useState<string[]>(() => {
    const v = searchParams.get("included");
    return v ? [v] : [];
  });
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
      downloadCsv([headers, ...rows], "daily-interest-ledger.csv");
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

  const totalPages = result ? Math.ceil(result.totalCount / pageSize) : 1;

  const td: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: 13,
    color: "#374151",
    borderBottom: "1px solid #f1f5f9",
  };

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
          Daily Interest Ledger
        </h1>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
          Read-only view of daily interest accrual records per investor
          application.
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
                label: "Total Records",
                value: result.totalCount.toLocaleString("en-US"),
              },
              {
                label: "Distribution - Paid",
                value: fmtMoney(result.totalNetInterestPaid),
              },
              {
                label: "Distribution - Accrued & Unpaid",
                value: fmtMoney(result.totalNetInterestUnpaid),
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

        {loading ? (
          <p style={{ color: "#64748b", fontSize: 14 }}>Loading…</p>
        ) : (
          <>
            <div className="table-scroll">
              <table style={{ minWidth: 900 }}>
                <thead>
                  <tr>
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
                  </tr>
                </thead>
                <tbody>
                  {result?.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
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
                  {result?.items.map((row) => (
                    <tr
                      key={row.id}
                      style={{
                        background: row.includedInMonthlyDistribution
                          ? "#f8fafc"
                          : undefined,
                      }}
                    >
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
                      <td style={{ ...td, fontWeight: 700, color: "#0e3416" }}>
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
                    </tr>
                  ))}
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
    </AdminLayout>
  );
}

export default function DailyInterestLedgerPage() {
  return (
    <Suspense>
      <DailyInterestLedgerContent />
    </Suspense>
  );
}
