'use client';
import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { PaginationControls } from '@/components/PaginationControls';
import { SortableTh } from '@/components/SortableTh';
import { adminApi, type OdooLogItem, type OdooLogDetail, type PagedResult } from '@/lib/api';

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
      {ok ? 'Success' : 'Failed'}
    </span>
  );
}

function DirectionBadge({ dir }: { dir: string }) {
  const out = dir === 'Outbound';
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: out ? '#eff6ff' : '#f5f3ff',
      color: out ? '#1d4ed8' : '#7c3aed',
    }}>{dir}</span>
  );
}

function PayloadViewer({ label, json }: { label: string; json?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!json) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;
  let pretty = json;
  try { pretty = JSON.stringify(JSON.parse(json), null, 2); } catch { /* keep raw */ }
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        style={{ fontSize: 12, color: '#0f2342', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        {open ? 'Hide' : 'View'} {label}
      </button>
      {open && (
        <pre style={{
          marginTop: 6, padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0',
          borderRadius: 6, fontSize: 11, overflowX: 'auto', maxHeight: 260,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>{pretty}</pre>
      )}
    </div>
  );
}

export default function OdooLogsPage() {
  const [result, setResult] = useState<PagedResult<OdooLogItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState('');
  const [isSuccess, setIsSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [sortOn, setSortOn] = useState('createdon');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (key: string) => {
    if (sortOn === key) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortOn(key); setSortDirection('asc'); }
    setPage(1);
  };
  const [detail, setDetail] = useState<{ id: number; data: OdooLogDetail } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE, sortOn, sortDirection };
    if (direction) params.direction = direction;
    if (isSuccess !== '') params.isSuccess = isSuccess;
    if (search) params.search = search;
    if (from) params.from = from;
    if (to) params.to = to;
    adminApi.odooLogs(params)
      .then(r => { if (r.success) setResult(r.data); })
      .finally(() => setLoading(false));
  }, [page, direction, isSuccess, search, from, to, sortOn, sortDirection]);

  useEffect(() => { load(); }, [load]);

  const viewDetail = async (id: number) => {
    if (detail?.id === id) { setDetail(null); return; }
    setLoadingDetail(true);
    const r = await adminApi.odooLog(id);
    setLoadingDetail(false);
    if (r.success && r.data) setDetail({ id, data: r.data });
  };

  const totalPages = result ? Math.ceil(result.totalCount / PAGE_SIZE) : 1;

  const th: React.CSSProperties = {
    padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.07em',
    borderBottom: '2px solid #e2e8f0', background: '#f8fafc', textAlign: 'left', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '10px 14px', fontSize: 13, color: '#374151',
    borderBottom: '1px solid #f1f5f9', verticalAlign: 'top',
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: 6 }}>Odoo API Logs</h1>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>All inbound and outbound Odoo API calls with payloads and status.</p>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search endpoint / entity…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, minWidth: 220 }} />
          <select value={direction} onChange={e => { setDirection(e.target.value); setPage(1); }}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: 'white' }}>
            <option value="">All Directions</option>
            <option value="Outbound">Outbound</option>
            <option value="Inbound">Inbound</option>
          </select>
          <select value={isSuccess} onChange={e => { setIsSuccess(e.target.value); setPage(1); }}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: 'white' }}>
            <option value="">All Results</option>
            <option value="true">Success</option>
            <option value="false">Failed</option>
          </select>
          <input type="date" value={from} onChange={e => { const nextFrom = e.target.value; setFrom(nextFrom); if (to && nextFrom && to < nextFrom) setTo(nextFrom); setPage(1); }}
            max={to || undefined}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
          <input type="date" value={to} onChange={e => { const nextTo = e.target.value; setTo(nextTo); if (from && nextTo && from > nextTo) setFrom(nextTo); setPage(1); }}
            min={from || undefined}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
          {(search || direction || isSuccess || from || to) && (
            <button
              onClick={() => {
                setSearch('');
                setDirection('');
                setIsSuccess('');
                setFrom('');
                setTo('');
                setPage(1);
              }}
              style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: 'white', color: '#475569', cursor: 'pointer' }}
            >
              Reset
            </button>
          )}
        </div>

        {loading ? (
          <p style={{ color: '#64748b', fontSize: 14 }}>Loading…</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <SortableTh label="Time" sortKey="createdon" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                    <SortableTh label="Direction" sortKey="direction" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                    <SortableTh label="Endpoint" sortKey="endpoint" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                    <SortableTh label="Entity" sortKey="entitytype" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                    <SortableTh label="HTTP" sortKey="httpstatuscode" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                    <th style={th}>Attempt</th>
                    <SortableTh label="Duration" sortKey="durationms" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                    <SortableTh label="Status" sortKey="issuccess" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={th} />
                    <th style={th}>Payloads</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.items.length === 0 && (
                    <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 32 }}>No logs found</td></tr>
                  )}
                  {result?.items.map(log => (
                    <React.Fragment key={log.id}>
                      <tr style={{ background: log.isSuccess ? undefined : '#fff8f8' }}>
                        <td style={{ ...td, whiteSpace: 'nowrap', fontSize: 12, color: '#6b7280' }}>
                          {new Date(log.createdOn).toLocaleString()}
                        </td>
                        <td style={td}><DirectionBadge dir={log.direction} /></td>
                        <td style={{ ...td, maxWidth: 220 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{log.endpoint}</span>
                        </td>
                        <td style={td}>
                          {log.entityType && <div style={{ fontSize: 12, fontWeight: 600 }}>{log.entityType}</div>}
                          {log.entityId && <div style={{ fontSize: 11, color: '#9ca3af' }}>#{log.entityId}</div>}
                        </td>
                        <td style={{ ...td, fontWeight: 600 }}>{log.httpStatusCode ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{log.attemptNumber}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{log.durationMs != null ? `${log.durationMs}ms` : '—'}</td>
                        <td style={td}>
                          <Badge ok={log.isSuccess} />
                          {log.errorMessage && (
                            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={log.errorMessage}>{log.errorMessage}</div>
                          )}
                        </td>
                        <td style={td}>
                          <button onClick={() => viewDetail(log.id)}
                            style={{ fontSize: 12, color: '#0f2342', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            {loadingDetail && detail?.id !== log.id ? '…' : detail?.id === log.id ? 'Close' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {detail?.id === log.id && (
                        <tr>
                          <td colSpan={9} style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', gap: 32 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Request</div>
                                <PayloadViewer label="payload" json={detail.data.requestPayloadJson} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Response</div>
                                <PayloadViewer label="payload" json={detail.data.responsePayloadJson} />
                              </div>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Correlation ID</div>
                                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#374151' }}>{detail.data.correlationId}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationControls
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              containerStyle={{ justifyContent: 'center', marginTop: 20 }}
              buttonStyle={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
              inputStyle={{ width: 64, padding: '6px 8px' }}
            />
            <p style={{ marginTop: 10, fontSize: 13, color: '#94a3b8' }}>{result?.totalCount ?? 0} total log{result?.totalCount !== 1 ? 's' : ''}</p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
