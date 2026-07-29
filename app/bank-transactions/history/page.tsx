"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { SortableTh } from "@/components/SortableTh";
import { bankTransactionsApi, type BankTxnImportSessionListItem } from "@/lib/api";
import { formatShortDateTime } from "@/lib/dateFormat";

type SortField = "id" | "fileName" | "importedAt" | "totalRows" | "succeeded" | "skipped" | "failed";

const sortValue = (s: BankTxnImportSessionListItem, field: SortField): string | number => {
  switch (field) {
    case "id":
      return s.id;
    case "fileName":
      return s.fileName ?? "";
    case "importedAt":
      return new Date(s.importedAt).getTime();
    case "totalRows":
      return s.totalRows;
    case "succeeded":
      return s.succeeded;
    case "skipped":
      return s.skipped;
    case "failed":
      return s.failed;
  }
};

export default function BankTransactionImportHistoryPage() {
  const [sessions, setSessions] = useState<BankTxnImportSessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortField, setSortField] = useState<SortField>("importedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (field: string) => {
    const f = field as SortField;
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      setSortDir("asc");
    }
  };

  useEffect(() => {
    bankTransactionsApi
      .getSessions()
      .then((res) => {
        if (res.success) setSessions(res.data);
        else setError(res.message || "Failed to load import history.");
      })
      .catch(() => setError("Network error. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const s = {
    page: { padding: "32px 0" } as React.CSSProperties,
    h1: { fontSize: 22, fontWeight: 700, color: "#0f2342", marginBottom: 4 } as React.CSSProperties,
    sub: { color: "#64748b", fontSize: 14, marginBottom: 28 } as React.CSSProperties,
    card: { background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "20px 24px" } as React.CSSProperties,
    table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
    th: { padding: "8px 12px", textAlign: "left" as const, background: "#0f2342", color: "#fff", fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const },
    td: { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", color: "#1a1a2e" },
  };

  return (
    <AdminLayout>
      <div style={s.page}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h1 style={{ ...s.h1, marginBottom: 0 }}>Bank Statement Import History</h1>
          <Link href="/bank-transactions" style={{ fontSize: 13, color: "#b8923a", fontWeight: 600, textDecoration: "none" }}>
            ← Back to Bank Statements
          </Link>
        </div>
        <p style={s.sub}>All bank statement import sessions, most recent first. Click a session to see how each row was handled.</p>

        <div style={s.card}>
          {loading && <p style={{ color: "#64748b", fontSize: 13 }}>Loading…</p>}
          {error && <p style={{ color: "#991b1b", fontSize: 13 }}>{error}</p>}
          {!loading && !error && sessions.length === 0 && (
            <p style={{ color: "#64748b", fontSize: 13 }}>No imports yet.</p>
          )}
          {!loading && sessions.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <SortableTh label="#" sortKey="id" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                    <SortableTh label="Imported At" sortKey="importedAt" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                    <SortableTh label="File" sortKey="fileName" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                    <SortableTh label="Total" sortKey="totalRows" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                    <SortableTh label="Imported" sortKey="succeeded" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                    <SortableTh label="Skipped" sortKey="skipped" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                    <SortableTh label="Failed" sortKey="failed" sortOn={sortField} sortDirection={sortDir} onSort={toggleSort} style={s.th} />
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {[...sessions]
                    .sort((a, b) => {
                      const av = sortValue(a, sortField);
                      const bv = sortValue(b, sortField);
                      if (av < bv) return sortDir === "asc" ? -1 : 1;
                      if (av > bv) return sortDir === "asc" ? 1 : -1;
                      return 0;
                    })
                    .map((sess) => (
                      <tr key={sess.id}>
                        <td style={s.td}>{sess.id}</td>
                        <td style={s.td}>{formatShortDateTime(sess.importedAt)}</td>
                        <td style={s.td}>{sess.fileName}</td>
                        <td style={s.td}>{sess.totalRows}</td>
                        <td style={{ ...s.td, color: "#166534", fontWeight: 600 }}>{sess.succeeded}</td>
                        <td style={{ ...s.td, color: sess.skipped > 0 ? "#92400e" : "#64748b", fontWeight: 600 }}>{sess.skipped}</td>
                        <td style={{ ...s.td, color: sess.failed > 0 ? "#991b1b" : "#64748b", fontWeight: 600 }}>{sess.failed}</td>
                        <td style={s.td}>
                          <Link
                            href={`/bank-transactions/history/${sess.id}`}
                            style={{ color: "#b8923a", fontWeight: 600, fontSize: 12, textDecoration: "none" }}
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
