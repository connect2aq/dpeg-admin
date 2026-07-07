'use client';
import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { SortableTh } from '@/components/SortableTh';
import { adminApi, type EmailLogItem, type EmailLogDetail, type PagedResult } from '@/lib/api';

const PAGE_SIZE = 25;

function Badge({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
      background: ok ? '#f0fdf4' : '#fef2f2',
      color: ok ? '#15803d' : '#dc2626',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
      {ok ? 'Sent' : 'Failed'}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    AdminEmail:        { bg: '#eff6ff', color: '#1d4ed8' },
    DirectEmail:       { bg: '#f5f3ff', color: '#7c3aed' },
    AdminNotification: { bg: '#fff7ed', color: '#c2410c' },
  };
  const style = colors[method] ?? { bg: '#f1f5f9', color: '#475569' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, ...style }}>
      {method}
    </span>
  );
}

function BodyViewer({ body }: { body?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!body) return <span style={{ color: '#9ca3af', fontSize: 12 }}>— suppressed —</span>;
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: 12, color: '#0f2342', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        {open ? 'Hide' : 'View'} body
      </button>
      {open && (
        <iframe
          srcDoc={body}
          style={{ marginTop: 8, width: '100%', minHeight: 300, border: '1px solid #e2e8f0', borderRadius: 6 }}
          sandbox=""
        />
      )}
    </div>
  );
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function EmailLogsPage() {
  const [result, setResult] = useState<PagedResult<EmailLogItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [sortOn, setSortOn] = useState('sentat');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (key: string) => {
    if (sortOn === key) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortOn(key); setSortDirection('asc'); }
    setPage(1);
  };
  const [detail, setDetail] = useState<{ id: number; data: EmailLogDetail } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE, sortOn, sortDirection };
    if (success !== '') params.success = success;
    if (search) params.search = search;
    if (from) params.from = from;
    if (to) params.to = to;
    adminApi.emailLogs(params)
      .then(r => { if (r.success) setResult(r.data); })
      .finally(() => setLoading(false));
  }, [page, success, search, from, to, sortOn, sortDirection]);

  useEffect(() => { load(); }, [load]);

  const openDetail = (id: number) => {
    if (detail?.id === id) { setDetail(null); return; }
    setLoadingDetail(true);
    adminApi.emailLog(id)
      .then(r => { if (r.success) setDetail({ id, data: r.data }); })
      .finally(() => setLoadingDetail(false));
  };

  const applyFilters = () => { setPage(1); load(); };

  const containerStyle: React.CSSProperties = { padding: '24px 32px', fontFamily: 'DM Sans, sans-serif' };
  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
    color: '#0f2342', background: '#fff', outline: 'none',
  };

  return (
    <AdminLayout>
      <div style={containerStyle}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f2342', marginBottom: 20 }}>Email Logs</h1>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
          <select value={success} onChange={e => setSuccess(e.target.value)} style={inputStyle}>
            <option value="">All Status</option>
            <option value="true">Sent</option>
            <option value="false">Failed</option>
          </select>
          <input
            placeholder="Search: to, subject, user email"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, width: 240 }}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
          />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
          <button onClick={applyFilters} style={{
            padding: '6px 16px', background: '#0f2342', color: '#fff', border: 'none',
            borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Filter</button>
          <button onClick={() => { setSuccess(''); setSearch(''); setFrom(''); setTo(''); setPage(1); }} style={{
            padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
            borderRadius: 6, fontSize: 13, cursor: 'pointer',
          }}>Clear</button>
        </div>

        {/* Table */}
        {loading ? (
          <p style={{ color: '#64748b' }}>Loading…</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {(() => {
                      const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' };
                      return (
                        <>
                          <SortableTh label="Sent At" sortKey="sentat" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                          <SortableTh label="Status" sortKey="success" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                          <SortableTh label="Method" sortKey="method" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                          <SortableTh label="To" sortKey="to" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                          <SortableTh label="Subject" sortKey="subject" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                          <SortableTh label="Triggered By" sortKey="useremail" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                          <th style={th}></th>
                        </>
                      );
                    })()}
                  </tr>
                </thead>
                <tbody>
                  {result?.items?.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 24, color: '#9ca3af', textAlign: 'center' }}>No email logs found.</td></tr>
                  )}
                  {result?.items?.map(row => (
                    <React.Fragment key={row.id}>
                      <tr style={{ borderBottom: '1px solid #f1f5f9', background: detail?.id === row.id ? '#f8fafc' : '#fff' }}>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#374151' }}>{fmt(row.sentAtUtc)}</td>
                        <td style={{ padding: '10px 12px' }}><Badge ok={row.success} /></td>
                        <td style={{ padding: '10px 12px' }}><MethodBadge method={row.method} /></td>
                        <td style={{ padding: '10px 12px', color: '#374151', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={row.toAddresses}>{row.toAddresses}</td>
                        <td style={{ padding: '10px 12px', color: '#374151', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={row.subject}>{row.subject ?? '—'}</td>
                        <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>
                          {row.userEmail
                            ? row.userEmail
                            : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>{row.toAddresses}</span>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button onClick={() => openDetail(row.id)} style={{
                            fontSize: 12, color: '#0f2342', textDecoration: 'underline',
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          }}>
                            {detail?.id === row.id ? 'Close' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {detail?.id === row.id && (
                        <tr style={{ background: '#f8fafc' }}>
                          <td colSpan={7} style={{ padding: '12px 20px' }}>
                            {loadingDetail ? <span style={{ color: '#64748b', fontSize: 13 }}>Loading…</span> : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {!detail.data.success && detail.data.failureReason && (
                                  <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>
                                    <strong>Failure:</strong> {detail.data.failureReason}
                                  </div>
                                )}
                                {detail.data.correlationId && (
                                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                                    Correlation ID: <code>{detail.data.correlationId}</code>
                                  </p>
                                )}
                                <BodyViewer body={detail.data.body} />
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {result && result.totalPages > 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '5px 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', color: '#374151' }}>
                  ‹ Prev
                </button>
                <span style={{ fontSize: 13, color: '#475569' }}>Page {page} of {result.totalPages} ({result.totalCount} records)</span>
                <button onClick={() => setPage(p => Math.min(result.totalPages, p + 1))} disabled={page === result.totalPages}
                  style={{ padding: '5px 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', cursor: page === result.totalPages ? 'not-allowed' : 'pointer', color: '#374151' }}>
                  Next ›
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
