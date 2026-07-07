'use client';
import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi, type AuditLogItem, type PagedResult } from '@/lib/api';
import { SortableTh } from '@/components/SortableTh';

const CATEGORIES = ['', 'Auth', 'Admin', 'Application', 'Redemption', 'Distribution', 'File'];
const PAGE_SIZE = 50;

function categoryColor(cat: string): { bg: string; color: string } {
  switch (cat) {
    case 'Auth':         return { bg: '#dbeafe', color: '#1e40af' };
    case 'Admin':        return { bg: '#fef9c3', color: '#92400e' };
    case 'Application':  return { bg: '#dcfce7', color: '#166534' };
    case 'Redemption':   return { bg: '#fce7f3', color: '#9d174d' };
    case 'Distribution': return { bg: '#ede9fe', color: '#6d28d9' };
    case 'File':         return { bg: '#e0f2fe', color: '#0369a1' };
    default:             return { bg: '#f1f5f9', color: '#475569' };
  }
}

function JsonCell({ json }: { json?: string }) {
  const [open, setOpen] = useState(false);
  if (!json) return <span style={{ color: '#94a3b8' }}>—</span>;
  let pretty: string;
  try { pretty = JSON.stringify(JSON.parse(json), null, 2); }
  catch { pretty = json; }
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: 11, color: '#0e3416', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
      >
        {open ? 'hide' : 'view'}
      </button>
      {open && (
        <pre style={{ marginTop: 4, fontSize: 10.5, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: '6px 8px', maxWidth: 340, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {pretty}
        </pre>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  const [result, setResult] = useState<PagedResult<AuditLogItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [eventType, setEventType] = useState('');
  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [appId, setAppId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [successFilter, setSuccessFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sortOn, setSortOn] = useState('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (key: string) => {
    if (sortOn === key) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortOn(key); setSortDirection('asc'); }
    setPage(1);
  };

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number | boolean> = { page, pageSize: PAGE_SIZE, sortOn, sortDirection };
    if (category) params.category = category;
    if (eventType) params.eventType = eventType;
    if (userId) params.userId = Number(userId);
    if (userEmail) params.userEmail = userEmail;
    if (appId) params.applicationId = Number(appId);
    if (from) params.from = from;
    if (to) params.to = to;
    if (successFilter !== '') params.success = successFilter === 'true';
    adminApi.auditLogs(params)
      .then(r => { if (r.success) setResult(r.data); })
      .finally(() => setLoading(false));
  }, [page, category, eventType, userId, userEmail, appId, from, to, successFilter, sortOn, sortDirection]);

  useEffect(() => { load(); }, [load]);

  const onSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); load(); };
  const onReset = () => {
    setCategory(''); setEventType(''); setUserId(''); setUserEmail(''); setAppId('');
    setFrom(''); setTo(''); setSuccessFilter(''); setPage(1);
  };

  const fmt = (ts: string) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: 8 }}>Audit Log</h1>
        <p style={{ fontSize: 13.5, color: '#64748b', marginBottom: 24 }}>
          Complete record of all system events, admin actions, and data changes.
        </p>

        {/* Filters */}
        <form onSubmit={onSearch} style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</label>
            <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}
              style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, background: 'white', minWidth: 140 }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c || 'All Categories'}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Event Type</label>
            <input type="text" value={eventType} onChange={e => setEventType(e.target.value)} placeholder="e.g. Login, StatusChanged"
              style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, width: 190 }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>User ID</label>
            <input type="number" value={userId} onChange={e => setUserId(e.target.value)} placeholder="User ID"
              style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, width: 100 }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>User Email</label>
            <input type="text" value={userEmail} onChange={e => setUserEmail(e.target.value)} placeholder="e.g. user@email.com"
              style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, width: 190 }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Application ID</label>
            <input type="number" value={appId} onChange={e => setAppId(e.target.value)} placeholder="App ID"
              style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, width: 100 }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</label>
            <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
              style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13.5 }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</label>
            <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
              style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13.5 }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Result</label>
            <select value={successFilter} onChange={e => { setSuccessFilter(e.target.value); setPage(1); }}
              style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, background: 'white', width: 120 }}>
              <option value="">All</option>
              <option value="true">Success</option>
              <option value="false">Failure</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
            <button type="submit" className="btn-primary">Filter</button>
            <button type="button" onClick={onReset}
              style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, background: 'white', cursor: 'pointer' }}>
              Reset
            </button>
          </div>
        </form>

        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 32, color: '#64748b' }}>Loading...</div>
          ) : result ? (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: 1100 }}>
                  <thead>
                    <tr>
                      <SortableTh label="Timestamp (UTC)" sortKey="timestamp" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={{ minWidth: 170 }} />
                      <SortableTh label="Category" sortKey="category" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableTh label="Event Type" sortKey="eventtype" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} style={{ minWidth: 200 }} />
                      <SortableTh label="Actor" sortKey="actor" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableTh label="User Email" sortKey="useremail" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableTh label="Entity" sortKey="entity" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableTh label="App ID" sortKey="appid" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableTh label="Result" sortKey="result" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <th>Old Values</th>
                      <th>New Values</th>
                      <th>Metadata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.length === 0 ? (
                      <tr><td colSpan={11} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>No audit events found</td></tr>
                    ) : result.items.map(log => {
                      const catStyle = categoryColor(log.eventCategory);
                      return (
                        <tr key={log.id}>
                          <td style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{fmt(log.timestampUtc)}</td>
                          <td>
                            <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20, ...catStyle }}>
                              {log.eventCategory}
                            </span>
                          </td>
                          <td style={{ fontSize: 12.5, fontWeight: 500 }}>{log.eventType}</td>
                          <td>
                            <span style={{ fontSize: 11.5, padding: '2px 7px', borderRadius: 20, background: log.actorRole === 'Admin' ? '#fef9c3' : '#f1f5f9', color: log.actorRole === 'Admin' ? '#92400e' : '#475569', fontWeight: 600 }}>
                              {log.actorRole}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: '#475569' }}>
                            {log.userEmail ? (
                              <span title={`ID: ${log.userId}`}>{log.userEmail}</span>
                            ) : log.userId ? (
                              <span style={{ color: '#94a3b8' }}>ID: {log.userId}</span>
                            ) : <span style={{ color: '#94a3b8' }}>—</span>}
                          </td>
                          <td style={{ fontSize: 12, color: '#475569' }}>
                            {log.entityName ? `${log.entityName}${log.entityId ? ` #${log.entityId}` : ''}` : <span style={{ color: '#94a3b8' }}>—</span>}
                          </td>
                          <td style={{ fontSize: 12, color: '#475569' }}>
                            {log.applicationId ?? <span style={{ color: '#94a3b8' }}>—</span>}
                          </td>
                          <td>
                            {log.success ? (
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: 20 }}>OK</span>
                            ) : (
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#991b1b', background: '#fee2e2', padding: '2px 8px', borderRadius: 20 }} title={log.failureReason ?? ''}>FAIL</span>
                            )}
                          </td>
                          <td><JsonCell json={log.oldValuesJson} /></td>
                          <td><JsonCell json={log.newValuesJson} /></td>
                          <td><JsonCell json={log.metadataJson} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {result.totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>
                    Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, result.totalCount)} of {result.totalCount.toLocaleString()} events
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      style={{ padding: '6px 14px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, background: page === 1 ? '#f8fafc' : 'white', cursor: page === 1 ? 'default' : 'pointer', color: page === 1 ? '#cbd5e1' : '#0e3416' }}>
                      ← Prev
                    </button>
                    <span style={{ padding: '6px 12px', fontSize: 13, color: '#475569' }}>
                      Page {page} of {result.totalPages}
                    </span>
                    <button onClick={() => setPage(p => Math.min(result.totalPages, p + 1))} disabled={page === result.totalPages}
                      style={{ padding: '6px 14px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, background: page === result.totalPages ? '#f8fafc' : 'white', cursor: page === result.totalPages ? 'default' : 'pointer', color: page === result.totalPages ? '#cbd5e1' : '#0e3416' }}>
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: 32, color: '#94a3b8' }}>Failed to load audit logs.</div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
