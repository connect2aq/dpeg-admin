'use client';
import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { PendingBadge } from '@/components/PendingBadge';
import { InvestmentEditModal } from '@/components/InvestmentEditModal';
import { SortableTh } from '@/components/SortableTh';
import { adminApi, type ApplicationListItem, type PagedResult, type PendingChangeItem } from '@/lib/api';
import { downloadCsv } from '@/lib/exportCsv';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

const STATUSES = ['', 'Deposited', 'UnderReview', 'Active', 'Redeemed', 'Rejected'];
const STATUS_LABELS: Record<string, string> = { '': 'All Statuses', Deposited: 'All Deposits (Active/Redeemed)' };
const TYPES = ['', 'Individual', 'Entity', 'IRA', 'Trust'];
const PAGE_SIZE = 20;

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<AdminLayout><div className="page-content" style={{ padding: 32, color: '#64748b' }}>Loading...</div></AdminLayout>}>
      <ApplicationsContent />
    </Suspense>
  );
}

function ApplicationsContent() {
  const { user: authUser } = useAdminAuth();
  const isSuperAdmin = (authUser?.adminRole ?? 'SuperAdmin') === 'SuperAdmin';
  const searchParams = useSearchParams();
  const [result, setResult] = useState<PagedResult<ApplicationListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [appIdInput, setAppIdInput] = useState('');
  const [status, setStatus] = useState(() =>
    searchParams.get('filter') === 'deposited' ? 'Deposited' : (searchParams.get('status') ?? '')
  );
  const [investorType, setInvestorType] = useState('');
  const [page, setPage] = useState(1);
  const [sortOn, setSortOn] = useState('createdOn');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (key: string) => {
    if (sortOn === key) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortOn(key); setSortDirection('asc'); }
    setPage(1);
  };

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [pendingMap, setPendingMap] = useState<Record<number, PendingChangeItem>>({});
  const [editingAppId, setEditingAppId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingOne, setDeletingOne] = useState(false);
  const [toast, setToast] = useState('');
  const [exporting, setExporting] = useState(false);

  const selectAllRef = useRef<HTMLInputElement>(null);

  const exportToExcel = async () => {
    setExporting(true);
    const params: Record<string, string | number> = { page: 1, pageSize: 100000, sortOn, sortDirection };
    const parsedAppId = appIdInput ? parseInt(appIdInput, 10) : NaN;
    if (!isNaN(parsedAppId)) { params.id = parsedAppId; }
    else {
      if (search) params.search = search;
      if (status === 'Deposited') params.deposited = 'true';
      else if (status) params.status = status;
      if (investorType) params.investorType = investorType;
    }
    const r = await adminApi.applications(params);
    if (r.success) {
      const headers = ['ID', 'PPM Ref', 'Account Name', 'Account Email', 'Investor', 'Type', 'Units', 'Amount', 'Status', 'Effective Date', 'Submitted'];
      const rows = r.data.items.map(a => [
        a.id, a.ppmRefNO ?? '', `${a.userFirstName} ${a.userLastName}`.trim(), a.userEmail,
        a.investorName ?? '', a.investorType, a.numUnits ?? '', a.totalAmount ?? '',
        a.status,
        a.effectiveDate ? new Date(a.effectiveDate).toLocaleDateString() : '',
        a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '',
      ]);
      downloadCsv([headers, ...rows], 'applications.csv');
    }
    setExporting(false);
  };

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE, sortOn, sortDirection };
    const parsedAppId = appIdInput ? parseInt(appIdInput, 10) : NaN;
    if (!isNaN(parsedAppId)) { params.id = parsedAppId; }
    else {
      if (search) params.search = search;
      if (status === 'Deposited') params.deposited = 'true';
      else if (status) params.status = status;
      if (investorType) params.investorType = investorType;
    }
    adminApi.applications(params)
      .then(r => {
        if (r.success) {
          setResult(r.data);
          const ids = r.data.items.map(a => a.id);
          if (ids.length > 0) {
            adminApi.getActivePendingForRecords('Investment', ids).then(pr => {
              if (pr.success) {
                const map: Record<number, PendingChangeItem> = {};
                pr.data.forEach(p => { if (p.entityId) map[p.entityId] = p; });
                setPendingMap(map);
              }
            });
          } else setPendingMap({});
        }
      })
      .finally(() => setLoading(false));
  }, [page, search, appIdInput, status, investorType, sortOn, sortDirection]);

  useEffect(() => { load(); }, [load]);

  // Keep select-all checkbox indeterminate state in sync
  useEffect(() => {
    if (!selectAllRef.current || !result) return;
    const pageIds = result.items.map(a => a.id);
    const selectedOnPage = pageIds.filter(id => selected.has(id)).length;
    selectAllRef.current.indeterminate = selectedOnPage > 0 && selectedOnPage < pageIds.length;
  }, [selected, result]);

  const toggleSelectAll = () => {
    if (!result) return;
    const pageIds = result.items.map(a => a.id);
    const allSelected = pageIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
  };

  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    const r = await adminApi.bulkDeleteApplications(Array.from(selected));
    if (r.success) {
      setSelected(new Set());
      setShowDeleteConfirm(false);
      if (isSuperAdmin) load();
      else alert(`Change submitted for approval — ${r.message}`);
    } else {
      alert(r.message || 'Delete failed.');
    }
    setDeleting(false);
  };

  const handleDeleteOne = async () => {
    if (!confirmDeleteId) return;
    setDeletingOne(true);
    const r = await adminApi.deleteApplication(confirmDeleteId);
    if (r.success) {
      setConfirmDeleteId(null);
      if (isSuperAdmin) load();
      else { setToast(`Delete request submitted for approval — ${r.message}`); load(); }
    } else alert(r.message || 'Delete failed.');
    setDeletingOne(false);
  };

  const pageIds = result?.items.map(a => a.id) ?? [];
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));

  return (
    <AdminLayout>
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416' }}>Applications</h1>
          {selected.size > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{ padding: '9px 18px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Delete Selected ({selected.size})
            </button>
          )}
        </div>

        {toast && (
          <div style={{ background: '#fffbeb', border: '1.5px solid #fbbf24', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>⏳ {toast}</span>
            <button onClick={() => setToast('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>×</button>
          </div>
        )}

        {/* Filters */}
        <form onSubmit={e => { e.preventDefault(); setPage(1); load(); }} style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <input
            type="number"
            value={appIdInput}
            onChange={e => { setAppIdInput(e.target.value); setPage(1); }}
            placeholder="App ID"
            style={{ flex: '0 0 110px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
          />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by investor, account user, or email..."
            style={{ flex: '1 1 250px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
          />
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
            style={{ flex: '1 1 130px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}
          </select>
          <select value={investorType} onChange={e => { setInvestorType(e.target.value); setPage(1); }}
            style={{ flex: '1 1 130px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
            {TYPES.map(t => <option key={t} value={t}>{t || 'All Types'}</option>)}
          </select>
          <button type="submit" className="btn-primary">Search</button>
          <button type="button" onClick={exportToExcel} disabled={exporting}
            style={{ padding: '10px 18px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.7 : 1 }}>
            {exporting ? 'Exporting…' : '↓ Export'}
          </button>
        </form>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 32, color: '#64748b' }}>Loading...</div>
          ) : result ? (
            <>
              <div className="table-scroll">
              <table style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th style={{ width: 40, padding: '12px 8px 12px 16px' }}>
                      <input
                        type="checkbox"
                        ref={selectAllRef}
                        checked={allPageSelected}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <SortableTh label="ID / Ref" sortKey="id" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                    <SortableTh label="Effective Date" sortKey="effectiveDate" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                    <SortableTh label="Submitted" sortKey="submitted" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                    <SortableTh label="Account User" sortKey="accountUser" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                    <SortableTh label="Investor" sortKey="investor" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                    <SortableTh label="Type" sortKey="investorType" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                    <SortableTh label="Units" sortKey="units" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                    <SortableTh label="Amount" sortKey="amount" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                    <SortableTh label="Status" sortKey="status" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.length === 0 ? (
                    <tr><td colSpan={11} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>No applications found</td></tr>
                  ) : result.items.map(a => (
                    <tr key={a.id} style={{ background: selected.has(a.id) ? '#fff7ed' : undefined }}>
                      <td style={{ padding: '12px 8px 12px 16px' }}>
                        <input
                          type="checkbox"
                          checked={selected.has(a.id)}
                          onChange={() => toggleOne(a.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{a.id}</div>
                        {a.ppmRefNO && <div style={{ fontSize: 11, color: '#94a3b8' }}>PPM {a.ppmRefNO}</div>}
                      </td>
                      <td style={{ color: '#64748b', fontSize: 13 }}>{a.effectiveDate ? new Date(a.effectiveDate).toLocaleDateString() : '—'}</td>
                      <td style={{ color: '#64748b', fontSize: 13 }}>{a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '—'}</td>
                      <td>
                        {a.userId ? (
                          <Link href={`/investor-statements?userId=${a.userId}`} style={{ fontWeight: 600, color: '#1e293b', textDecoration: 'underline' }} title="Open Investor Statement">
                            {a.userFirstName} {a.userLastName}
                          </Link>
                        ) : (
                          <div style={{ fontWeight: 600 }}>{a.userFirstName} {a.userLastName}</div>
                        )}
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{a.userEmail}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{a.investorName || '—'}</div>
                      </td>
                      <td>{a.investorType}</td>
                      <td>{a.numUnits ?? '—'}</td>
                      <td style={{ fontWeight: 600 }}>{a.totalAmount ? `$${a.totalAmount.toLocaleString()}` : '—'}</td>
                      <td>
                        <StatusBadge status={a.status} />
                        {pendingMap[a.id] && <PendingBadge item={pendingMap[a.id]} />}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <Link href={`/applications/${a.id}`} style={{ color: '#699172', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>View</Link>
                          <button onClick={() => setEditingAppId(a.id)} style={{ fontSize: 13, color: '#0f2342', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                          <button onClick={() => setConfirmDeleteId(a.id)} style={{ fontSize: 13, color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  {result.totalCount} applications · Page {result.page} of {result.totalPages}
                  {selected.size > 0 && <span style={{ marginLeft: 12, color: '#b8923a', fontWeight: 600 }}>{selected.size} selected</span>}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '8px 16px', fontSize: 13 }}>← Prev</button>
                  <button className="btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page >= result.totalPages} style={{ padding: '8px 16px', fontSize: 13 }}>Next →</button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 32, color: '#ef4444' }}>Failed to load applications.</div>
          )}
        </div>
      </div>

      {/* Bulk delete confirmation modal */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f2342', marginBottom: 10 }}>Delete {selected.size} Application{selected.size !== 1 ? 's' : ''}?</h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 6 }}>
              This will permanently delete the selected applications and all associated data (interest logs, distribution logs, statements, linked redemptions).
            </p>
            <p style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600, marginBottom: 20 }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: '10px 20px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single-record delete confirmation modal */}
      {confirmDeleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f2342', marginBottom: 10 }}>Delete Application #{confirmDeleteId}?</h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 6 }}>
              This will permanently delete the application and all associated data (interest logs, distribution logs, statements, linked redemptions).
            </p>
            <p style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600, marginBottom: 20 }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setConfirmDeleteId(null)} disabled={deletingOne}>Cancel</button>
              <button
                onClick={handleDeleteOne}
                disabled={deletingOne}
                style={{ padding: '10px 20px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: deletingOne ? 'not-allowed' : 'pointer', opacity: deletingOne ? 0.7 : 1 }}
              >
                {deletingOne ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingAppId && (
        <InvestmentEditModal
          applicationId={editingAppId}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setEditingAppId(null)}
          onSaved={(pendingSubmitted, message) => {
            if (pendingSubmitted) setToast(message);
            load();
          }}
        />
      )}
    </AdminLayout>
  );
}
