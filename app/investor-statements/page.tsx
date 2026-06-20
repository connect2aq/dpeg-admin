"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { adminApi, type UserListItem, type InvestorCapitalAccount, type InvestorCapitalAccountEntry } from "@/lib/api";

const TYPE_COLORS: Record<string, { badge: string; text: string }> = {
  Contribution: { badge: "bg-green-100 text-green-700",   text: "text-green-700"  },
  Redemption:   { badge: "bg-red-100 text-red-700",       text: "text-red-700"    },
  Dividend:     { badge: "bg-amber-100 text-amber-700",   text: "text-amber-700"  },
  Clawback:     { badge: "bg-orange-100 text-orange-700", text: "text-orange-700" },
};

const fmt = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtSigned = (n: number) =>
  `${n < 0 ? "−" : "+"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function exportCSV(data: InvestorCapitalAccount, investorName: string) {
  const headers = ["Date", "Type", "App ID", "PPM Ref", "Units", "Capital", "Income", "Capital Balance"];
  const rows = data.entries.map(e => [
    new Date(e.date).toLocaleDateString("en-US"),
    e.entryType,
    e.applicationId ? `#${e.applicationId}` : "",
    e.ppmRefNo ? `#${e.ppmRefNo}` : "",
    e.units ?? "",
    e.amount !== 0 ? e.amount.toFixed(2) : "",
    e.income > 0 ? e.income.toFixed(2) : "",
    e.amount !== 0 ? e.runningBalance.toFixed(2) : "",
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `capital-account-${investorName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(data: InvestorCapitalAccount, investorName: string, ytdIncome: number, accrued: number) {
  const rows = data.entries.map(e => `
    <tr>
      <td>${new Date(e.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</td>
      <td>${e.entryType}</td>
      <td>${e.applicationId ? "#" + e.applicationId : "—"}</td>
      <td>${e.ppmRefNo ? "#" + e.ppmRefNo : "—"}</td>
      <td class="r">${e.units ?? "—"}</td>
      <td class="r ${e.amount > 0 ? "green" : e.amount < 0 ? "red" : "muted"}">${e.amount !== 0 ? fmtSigned(e.amount) : "—"}</td>
      <td class="r amber">${e.income > 0 ? "+" + fmt(e.income) : "—"}</td>
      <td class="r">${e.amount !== 0 ? fmt(e.runningBalance) : "—"}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Capital Account Statement — ${investorName}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a2e; margin: 0; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #0f2342; padding-bottom: 16px; }
    .header h1 { margin: 0; font-size: 18px; color: #0f2342; }
    .header p { margin: 4px 0 0; color: #666; font-size: 11px; }
    .meta { text-align: right; color: #666; font-size: 11px; }
    .cards { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .card { border: 1px solid #dde; border-radius: 8px; padding: 10px 14px; min-width: 120px; }
    .card label { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 2px; }
    .card .val { font-size: 15px; font-weight: 700; color: #0f2342; }
    .card .sub { font-size: 9px; color: #888; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #f5f7fa; text-align: left; padding: 7px 8px; font-size: 10px; font-weight: 700; color: #666; border-bottom: 1px solid #dde; }
    td { padding: 6px 8px; border-bottom: 1px solid #eef; font-size: 10px; }
    .r { text-align: right; }
    .green { color: #15803d; font-weight: 600; }
    .red { color: #b91c1c; font-weight: 600; }
    .amber { color: #b45309; font-weight: 600; }
    .muted { color: #999; }
    tfoot td { font-weight: 700; border-top: 2px solid #0f2342; background: #f5f7fa; }
    .footnote { margin-top: 20px; padding: 10px 14px; border: 1px solid #dde; border-radius: 8px; font-size: 10px; color: #666; line-height: 1.6; }
    @media print { body { padding: 16px; } }
  </style></head><body>
  <div class="header">
    <div>
      <h1>Capital Account Statement</h1>
      <p>DPEG Real Estate Fund &nbsp;·&nbsp; <strong>${investorName}</strong></p>
    </div>
    <div class="meta">
      <div>Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
      <div style="margin-top:4px;color:#888;">For internal use</div>
    </div>
  </div>
  <div class="cards">
    <div class="card"><label>Total Contributed</label><div class="val green">${fmt(data.totalContributions)}</div></div>
    <div class="card"><label>Capital Deployed</label><div class="val">${fmt(data.netPosition)}</div></div>
    <div class="card"><label>Total Income</label><div class="val amber">${fmt(data.totalIncome)}</div><div class="sub">${fmt(ytdIncome)} YTD</div></div>
    <div class="card"><label>Accrued (Unpaid)</label><div class="val amber">${fmt(accrued)}</div></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th>App ID</th><th>PPM Ref</th><th class="r">Units</th><th class="r">Capital</th><th class="r">Income</th><th class="r">Capital Balance</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="5">${data.entries.length} entries</td>
      <td class="r">${fmtSigned(data.entries.reduce((s, e) => s + e.amount, 0))}</td>
      <td class="r amber">+${fmt(data.totalIncome)}</td>
      <td class="r">${fmt(data.netPosition)}</td>
    </tr></tfoot>
  </table>
  <div class="footnote">
    <strong>Capital Balance</strong> tracks capital deployed — increases on contributions, decreases when capital is returned on redemption.
    Dividends are income paid to the investor's bank and do not reduce capital balance. Accrued (unpaid) interest will appear as a Dividend once distributed.
  </div>
  </body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}

export default function InvestorStatementsPage() {
  const [investors, setInvestors] = useState<UserListItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InvestorCapitalAccount | null>(null);
  const [accrued] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [investorsLoading, setInvestorsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi.users({ page: 1, pageSize: 500 })
      .then(r => { if (r.success) setInvestors(r.data.items); })
      .catch(() => {})
      .finally(() => setInvestorsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedUserId) { setData(null); return; }
    setLoading(true);
    setError("");
    setData(null);
    adminApi.investorStatement(selectedUserId)
      .then(r => { if (r.success && r.data) setData(r.data); else setError("No data found for this investor."); })
      .catch(() => setError("Failed to load statement."))
      .finally(() => setLoading(false));
  }, [selectedUserId]);

  const suggestions = investors.filter(u => {
    if (!inputValue || selectedUserId) return false;
    const q = inputValue.toLowerCase();
    return `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q);
  }).slice(0, 8);

  const selectedInvestor = investors.find(u => u.id === selectedUserId);
  const investorName = selectedInvestor ? `${selectedInvestor.firstName} ${selectedInvestor.lastName}` : "";

  function selectInvestor(u: UserListItem) {
    setSelectedUserId(u.id);
    setInputValue(`${u.firstName} ${u.lastName}`);
    setOpen(false);
  }

  function clearSelection() {
    setSelectedUserId(null);
    setInputValue("");
    setData(null);
    setOpen(false);
  }

  const visible: InvestorCapitalAccountEntry[] = (data?.entries ?? []).filter(
    e => !typeFilter || e.entryType === typeFilter,
  );

  const currentYear = new Date().getFullYear();
  const ytdIncome = (data?.entries ?? [])
    .filter(e => new Date(e.date).getFullYear() === currentYear)
    .reduce((s, e) => s + e.income, 0);

  return (
    <AdminLayout>
      <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--forest)", margin: 0 }}>
            Investor Statements
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            View and export Capital Account Statements for any investor.
          </p>
        </div>

        {/* Investor combobox */}
        <div style={{ marginBottom: 28, maxWidth: 480, position: "relative" }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Search Investor
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder={investorsLoading ? "Loading investors…" : "Type name or email to search…"}
              value={inputValue}
              disabled={investorsLoading}
              onChange={e => { setInputValue(e.target.value); setOpen(true); if (selectedUserId) clearSelection(); }}
              onFocus={() => { if (!selectedUserId && inputValue) setOpen(true); }}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              style={{ width: "100%", padding: "10px 36px 10px 14px", fontSize: 13, border: `1.5px solid ${open ? "var(--forest)" : "var(--border)"}`, borderRadius: 8, background: "var(--bg-card)", color: "var(--text-primary)", boxSizing: "border-box", outline: "none" }}
            />
            {selectedUserId ? (
              <button onClick={clearSelection} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1, padding: 2 }} title="Clear">×</button>
            ) : (
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 12, pointerEvents: "none" }}>▾</span>
            )}
          </div>
          {open && suggestions.length > 0 && (
            <div style={{ position: "absolute", zIndex: 50, top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", overflow: "hidden" }}>
              {suggestions.map(u => (
                <button
                  key={u.id}
                  onMouseDown={() => selectInvestor(u)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-section)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{u.firstName} {u.lastName}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{u.email}</div>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--muted)", background: "var(--bg-section)", borderRadius: 4, padding: "2px 6px" }}>{u.status}</span>
                </button>
              ))}
            </div>
          )}
          {open && !investorsLoading && inputValue.length > 0 && suggestions.length === 0 && (
            <div style={{ position: "absolute", zIndex: 50, top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "var(--muted)" }}>
              No investors found for &ldquo;{inputValue}&rdquo;
            </div>
          )}
        </div>

        {/* Empty state */}
        {!selectedUserId && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 48, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
            Select an investor above to view their Capital Account Statement.
          </div>
        )}

        {loading && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 48, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
            Loading…
          </div>
        )}

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 24, textAlign: "center", color: "#b91c1c", fontSize: 13 }}>
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Investor name */}
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--forest)" }}>{investorName}</span>
              <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 10 }}>{selectedInvestor?.email}</span>
            </div>

            {/* Summary cards */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Total Contributed", value: fmt(data.totalContributions), color: "#15803d" },
                { label: "Capital Deployed",  value: fmt(data.netPosition),        color: "var(--forest)" },
                { label: "Total Income",      value: fmt(data.totalIncome),        color: "#b45309", sub: `${fmt(ytdIncome)} YTD` },
                { label: "Accrued (Unpaid)",  value: fmt(accrued),                 color: "#b45309" },
              ].map(c => (
                <div key={c.label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", minWidth: 140 }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: 4 }}>{c.label}</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</p>
                  {c.sub && <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--muted)" }}>{c.sub}</p>}
                </div>
              ))}
            </div>

            {/* Filter + Export */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <select
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value)}
                  style={{ padding: "7px 10px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-primary)" }}
                >
                  <option value="">All Activity</option>
                  <option value="Contribution">Contributions</option>
                  <option value="Redemption">Redemptions</option>
                  <option value="Dividend">Dividends</option>
                </select>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{visible.length} entries</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => exportCSV(data, investorName)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", color: "var(--muted)", cursor: "pointer" }}
                >
                  ↓ CSV
                </button>
                <button
                  onClick={() => exportPDF(data, investorName, ytdIncome, accrued)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", color: "var(--muted)", cursor: "pointer" }}
                >
                  ↓ PDF
                </button>
              </div>
            </div>

            {/* Table */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-section)", borderBottom: "1px solid var(--border)" }}>
                      {["Date", "Type", "App ID", "PPM Ref", "Units", "Capital", "Income", "Capital Balance"].map((h, i) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: i >= 4 ? "right" : "left", fontWeight: 600, fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((e, i) => {
                      const colors = TYPE_COLORS[e.entryType] ?? TYPE_COLORS.Contribution;
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? undefined : "var(--bg-section)" }}>
                          <td style={{ padding: "9px 14px", color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                            {new Date(e.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                          </td>
                          <td style={{ padding: "9px 14px" }}>
                            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${colors.badge}`}>
                              {e.entryType}
                            </span>
                          </td>
                          <td style={{ padding: "9px 14px", color: "var(--muted)", fontSize: 12 }}>
                            {e.applicationId ? `#${e.applicationId}` : "—"}
                          </td>
                          <td style={{ padding: "9px 14px", color: "var(--muted)", fontSize: 12 }}>
                            {e.ppmRefNo ? `#${e.ppmRefNo}` : "—"}
                          </td>
                          <td style={{ padding: "9px 14px", textAlign: "right", color: "var(--text-primary)" }}>
                            {e.units != null ? e.units : "—"}
                          </td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", color: e.amount > 0 ? "#15803d" : e.amount < 0 ? "#b91c1c" : "var(--muted)" }}>
                            {e.amount !== 0 ? fmtSigned(e.amount) : "—"}
                          </td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 600, color: e.income < 0 ? "#c2410c" : "#b45309", whiteSpace: "nowrap" }}>
                            {e.income > 0 ? `+${fmt(e.income)}` : e.income < 0 ? `−${fmt(Math.abs(e.income))}` : "—"}
                          </td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                            {e.amount !== 0 ? fmt(e.runningBalance) : <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border)", background: "var(--bg-section)" }}>
                      <td colSpan={5} style={{ padding: "9px 14px", fontWeight: 600, color: "var(--muted)", fontSize: 12 }}>
                        {visible.length} entries
                      </td>
                      <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 700, color: "var(--text-primary)", fontSize: 13 }}>
                        {fmtSigned(visible.reduce((s, e) => s + e.amount, 0))}
                      </td>
                      <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 700, color: "#b45309", fontSize: 13 }}>
                        {(() => { const t = visible.reduce((s, e) => s + (e.income ?? 0), 0); return t >= 0 ? `+${fmt(t)}` : `−${fmt(Math.abs(t))}`; })()}
                      </td>
                      <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 700, color: "var(--text-primary)", fontSize: 13 }}>
                        {fmt(data.netPosition)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
