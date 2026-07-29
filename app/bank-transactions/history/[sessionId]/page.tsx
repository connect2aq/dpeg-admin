"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { SortableTh } from "@/components/SortableTh";
import {
  bankTransactionsApi,
  type BankTxnImportSessionDetail,
  type BankTransactionImportRowResult,
} from "@/lib/api";
import { formatShortDate, formatShortDateTime } from "@/lib/dateFormat";

type SortField = "rowNumber" | "postDate" | "amount" | "outcome";

const sortValue = (r: BankTransactionImportRowResult, field: SortField): string | number => {
  switch (field) {
    case "rowNumber":
      return r.rowNumber;
    case "postDate":
      return r.postDate ? new Date(r.postDate).getTime() : 0;
    case "amount":
      return r.amount ?? 0;
    case "outcome":
      return r.outcome;
  }
};

const OUTCOME_STYLE: Record<BankTransactionImportRowResult["outcome"], { bg: string; fg: string; label: string }> = {
  Imported: { bg: "#dcfce7", fg: "#166534", label: "Imported" },
  Skipped_Duplicate: { bg: "#f1f5f9", fg: "#475569", label: "Skipped — Duplicate" },
  Skipped_Pending: { bg: "#fef3c7", fg: "#92400e", label: "Skipped — Pending" },
  Failed: { bg: "#fee2e2", fg: "#991b1b", label: "Failed" },
};

function OutcomeBadge({ outcome }: { outcome: BankTransactionImportRowResult["outcome"] }) {
  const style = OUTCOME_STYLE[outcome];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: style.bg,
        color: style.fg,
      }}
    >
      {style.label}
    </span>
  );
}

function fmtMoney(n?: number) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BankTransactionImportSessionDetailPage() {
  const params = useParams();
  const sessionId = Number(params.sessionId);

  const [session, setSession] = useState<BankTxnImportSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortField, setSortField] = useState<SortField>("rowNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (field: string) => {
    const f = field as SortField;
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      setSortDir("asc");
    }
  };

  useEffect(() => {
    setLoading(true);
    bankTransactionsApi
      .getSessionDetail(sessionId)
      .then((res) => {
        if (res.success) setSession(res.data);
        else setError(res.message || "Session not found.");
      })
      .catch(() => setError("Network error. Please try again."))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const s = {
    page: { padding: "32px 0" } as React.CSSProperties,
    h1: { fontSize: 22, fontWeight: 700, color: "#0f2342", marginBottom: 4 } as React.CSSProperties,
    sub: { color: "#64748b", fontSize: 14, marginBottom: 20 } as React.CSSProperties,
    card: { background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "20px 24px", marginBottom: 20 } as React.CSSProperties,
    table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
    th: { padding: "8px 12px", textAlign: "left" as const, background: "#0f2342", color: "#fff", fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const },
    td: { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", color: "#1a1a2e" },
  };

  return (
    <AdminLayout>
      <div style={s.page}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h1 style={{ ...s.h1, marginBottom: 0 }}>Import Session #{sessionId}</h1>
          <Link href="/bank-transactions/history" style={{ fontSize: 13, color: "#b8923a", fontWeight: 600, textDecoration: "none" }}>
            ← Back to Import History
          </Link>
        </div>

        {loading && <p style={{ color: "#64748b", fontSize: 13 }}>Loading…</p>}
        {error && <p style={{ color: "#991b1b", fontSize: 13 }}>{error}</p>}

        {session && (
          <>
            <p style={s.sub}>
              {session.fileName} — imported {formatShortDateTime(session.importedAt)} by User #{session.importedByUserId}
            </p>

            <div style={{ ...s.card, display: "flex", gap: 24, fontSize: 13, color: "#64748b", flexWrap: "wrap" }}>
              <span>
                Total: <strong>{session.totalRows}</strong>
              </span>
              <span style={{ color: "#166534" }}>
                Imported: <strong>{session.succeeded}</strong>
              </span>
              <span style={{ color: "#92400e" }}>
                Skipped: <strong>{session.skipped}</strong>
              </span>
              <span style={{ color: "#991b1b" }}>
                Failed: <strong>{session.failed}</strong>
              </span>
            </div>

            <div style={s.card}>
              {session.rows.length === 0 ? (
                <p style={{ color: "#64748b", fontSize: 13 }}>No rows in this session.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <SortableTh label="Row" sortKey="rowNumber" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                        <SortableTh label="Date" sortKey="postDate" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                        <th style={s.th}>Description</th>
                        <SortableTh label="Amount" sortKey="amount" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={{ ...s.th, textAlign: "right" }} />
                        <SortableTh label="Outcome" sortKey="outcome" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                        <th style={s.th}>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...session.rows]
                        .sort((a, b) => {
                          const av = sortValue(a, sortField);
                          const bv = sortValue(b, sortField);
                          if (av < bv) return sortDir === "asc" ? -1 : 1;
                          if (av > bv) return sortDir === "asc" ? 1 : -1;
                          return 0;
                        })
                        .map((r) => (
                          <tr key={r.rowNumber}>
                            <td style={s.td}>{r.rowNumber}</td>
                            <td style={s.td}>{r.postDate ? formatShortDate(r.postDate) : "—"}</td>
                            <td style={{ ...s.td, maxWidth: 320 }} title={r.description}>
                              {r.description ?? "—"}
                            </td>
                            <td style={{ ...s.td, textAlign: "right" }}>{fmtMoney(r.amount)}</td>
                            <td style={s.td}>
                              <OutcomeBadge outcome={r.outcome} />
                            </td>
                            <td style={{ ...s.td, color: "#991b1b" }}>{r.errorMessage ?? "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
