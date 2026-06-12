'use client';
import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { adminApi, type PendingChangeItem, type PendingChangeDetail, type PagedResult } from '@/lib/api';

const STATUSES = ['', 'Pending', 'Checked', 'Approved', 'Rejected', 'Cancelled'];
const ENTITY_TYPES = ['', 'Investment', 'Redemption', 'Distribution', 'BulkUsers', 'BulkApplications', 'BulkRedemptions'];
const PAGE_SIZE = 20;

function StatusChip({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    Pending:   { bg: '#fef3c7', color: '#92400e' },
    Checked:   { bg: '#dbeafe', color: '#1d4ed8' },
    Approved:  { bg: '#d1fae5', color: '#065f46' },
    Rejected:  { bg: '#fee2e2', color: '#b91c1c' },
    Cancelled: { bg: '#f1f5f9', color: '#64748b' },
  };
  const s = colors[status] ?? { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {status}
    </span>
  );
}

function DetailModal({ change, onClose, onAction, actingRole }: {
  change: PendingChangeDetail;
  onClose: () => void;
  onAction: () => void;
  actingRole: string;
}) {
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const canCheck = actingRole === 'Checker' || actingRole === 'SuperAdmin';
  const canApprove = actingRole === 'Approver' || actingRole === 'SuperAdmin';
  const canReject = canCheck || canApprove;

  const doCheck = async () => {
    setBusy(true);
    const r = await adminApi.checkChange(change.id, note || undefined);
    if (r.success) { onAction(); onClose(); }
    else setMsg(r.message);
    setBusy(false);
  };

  const doApprove = async () => {
    setBusy(true);
    const r = await adminApi.approveChange(change.id, note || undefined);
    if (r.success) { onAction(); onClose(); }
    else setMsg(r.message);
    setBusy(false);
  };

  const doReject = async () => {
    if (!reason.trim()) { setMsg('Rejection reason is required.'); return; }
    setBusy(true);
    const r = await adminApi.rejectChange(change.id, reason);
    if (r.success) { onAction(); onClose(); }
    else setMsg(r.message);
    setBusy(false);
  };

  const doCancel = async () => {
    setBusy(true);
    const r = await adminApi.cancelChange(change.id);
    if (r.success) { onAction(); onClose(); }
    else setMsg(r.message);
    setBusy(false);
  };

  const tdLabel = { padding: '7px 12px', background: '#f8fafc', fontWeight: 700, fontSize: 12, color: '#475569', width: 160, verticalAlign: 'top' as const, whiteSpace: 'nowrap' as const };
  const tdVal = { padding: '7px 12px', fontSize: 13, color: '#1e293b', verticalAlign: 'top' as const, wordBreak: 'break-word' as const };

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(change.payloadJson); } catch { /**/ }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '40px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'white', borderRadius: 12, width: 740, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f2342', margin: 0 }}>Change #{change.id}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <StatusChip status={change.status} />

          {/* Summary table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16, fontSize: 13 }}>
            <tbody>
              <tr><td style={tdLabel}>Description</td><td style={tdVal}>{change.description}</td></tr>
              <tr><td style={tdLabel}>Operation</td><td style={tdVal}>{change.operationType} / {change.entityType}</td></tr>
              {change.entityId && <tr><td style={tdLabel}>Record ID</td><td style={tdVal}>#{change.entityId}</td></tr>}
              <tr><td style={tdLabel}>Maker</td><td style={tdVal}>{change.makerName} ({change.makerEmail})</td></tr>
              <tr><td style={tdLabel}>Submitted</td><td style={tdVal}>{new Date(change.createdOn).toLocaleString()}</td></tr>
              {change.makerNote && <tr><td style={tdLabel}>Maker Note</td><td style={tdVal}>{change.makerNote}</td></tr>}
              {change.checkerName && <tr><td style={tdLabel}>Checker</td><td style={tdVal}>{change.checkerName} @ {change.checkedAt ? new Date(change.checkedAt).toLocaleString() : '—'}</td></tr>}
              {change.checkerNote && <tr><td style={tdLabel}>Checker Note</td><td style={tdVal}>{change.checkerNote}</td></tr>}
              {change.approverName && <tr><td style={tdLabel}>Approver</td><td style={tdVal}>{change.approverName} @ {change.approvedAt ? new Date(change.approvedAt).toLocaleString() : '—'}</td></tr>}
              {change.approverNote && <tr><td style={tdLabel}>Approver Note</td><td style={tdVal}>{change.approverNote}</td></tr>}
              {change.rejectedByName && <tr><td style={tdLabel}>Rejected By</td><td style={tdVal}>{change.rejectedByName} @ {change.rejectedAt ? new Date(change.rejectedAt).toLocaleString() : '—'}</td></tr>}
              {change.rejectionReason && <tr><td style={tdLabel}>Rejection Reason</td><td style={{ ...tdVal, color: '#b91c1c' }}>{change.rejectionReason}</td></tr>}
            </tbody>
          </table>

          {/* Payload preview */}
          {Object.keys(payload).length > 0 && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>Payload (submitted values)</summary>
              <div style={{ marginTop: 8, background: '#f8fafc', borderRadius: 6, padding: 12, fontSize: 12, fontFamily: 'monospace', maxHeight: 240, overflowY: 'auto', wordBreak: 'break-all' }}>
                {Object.entries(payload).filter(([,v]) => v !== null && v !== '' && v !== undefined).map(([k, v]) => (
                  <div key={k}><strong>{k}:</strong> {String(v)}</div>
                ))}
              </div>
            </details>
          )}

          {/* Actions */}
          {(change.status === 'Pending' || change.status === 'Checked') && (
            <div style={{ marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {canReject ? 'Note (optional for Check/Approve, required for Reject)' : 'Note (optional)'}
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add a note..."
                  style={{ width: '100%', padding: '8px 11px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, resize: 'vertical', minHeight: 60, boxSizing: 'border-box' }}
                />
              </div>

              {canReject && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Rejection Reason (required to reject)
                  </label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Required if rejecting..."
                    style={{ width: '100%', padding: '8px 11px', border: '1.5px solid #fca5a5', borderRadius: 6, fontSize: 13, resize: 'vertical', minHeight: 50, boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {change.status === 'Pending' && canCheck && (
                  <button onClick={doCheck} disabled={busy} style={{ padding: '9px 18px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                    ✓ Check
                  </button>
                )}
                {change.status === 'Checked' && canApprove && (
                  <button onClick={doApprove} disabled={busy} style={{ padding: '9px 18px', background: '#065f46', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                    ✓ Approve & Execute
                  </button>
                )}
                {canReject && (
                  <button onClick={doReject} disabled={busy} style={{ padding: '9px 18px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                    ✗ Reject
                  </button>
                )}
                {change.status === 'Pending' && (
                  <button onClick={doCancel} disabled={busy} style={{ padding: '9px 18px', background: 'white', color: '#64748b', border: '1.5px solid #e2e8f0', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer' }}>
                    Cancel Request
                  </button>
                )}
              </div>
              {msg && <p style={{ marginTop: 10, fontSize: 13, color: '#ef4444' }}>{msg}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PendingApprovalsPage() {
  const { user: authUser } = useAdminAuth();
  const adminRole = authUser?.adminRole ?? 'SuperAdmin';

  const [result, setResult] = useState<PagedResult<PendingChangeItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<PendingChangeDetail | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
    if (status) params.status = status;
    if (entityType) params.entityType = entityType;
    adminApi.getPendingChanges(params)
      .then(r => { if (r.success) setResult(r.data); })
      .finally(() => setLoading(false));
  }, [page, status, entityType]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: number) => {
    const r = await adminApi.getPendingChange(id);
    if (r.success && r.data) setDetail(r.data);
  };

  const pageIds = result?.items.map(i => i.id) ?? [];

  return (
    <AdminLayout>
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416' }}>Pending Approvals</h1>
          <span style={{ fontSize: 13, color: '#64748b' }}>Role: <strong style={{ color: '#b8923a' }}>{adminRole}</strong></span>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
            style={{ flex: '1 1 140px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
            {STATUSES.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
          </select>
          <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1); }}
            style={{ flex: '1 1 160px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t || 'All Types'}</option>)}
          </select>
          {(status || entityType) && (
            <button onClick={() => { setStatus(''); setEntityType(''); setPage(1); }}
              style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white', cursor: 'pointer', color: '#64748b' }}>Clear</button>
          )}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 32, color: '#64748b' }}>Loading...</div>
          ) : result ? (
            <>
              <div className="table-scroll">
                <table style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Maker</th>
                      <th>Submitted</th>
                      <th>Checker</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>No pending changes found</td></tr>
                    ) : result.items.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#b8923a' }}>#{item.id}</td>
                        <td>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>{item.entityType}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>{item.operationType}</div>
                        </td>
                        <td style={{ maxWidth: 260 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</div>
                        </td>
                        <td style={{ fontSize: 13 }}>
                          <div style={{ fontWeight: 600 }}>{item.makerName}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.makerEmail}</div>
                        </td>
                        <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{new Date(item.createdOn).toLocaleDateString()}</td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>{item.checkerName ?? '—'}</td>
                        <td><StatusChip status={item.status} /></td>
                        <td>
                          <button onClick={() => openDetail(item.id)}
                            style={{ padding: '5px 12px', background: '#0f2342', color: 'white', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>{result.totalCount} changes · Page {result.page} of {result.totalPages}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '8px 16px', fontSize: 13 }}>← Prev</button>
                  <button className="btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page >= result.totalPages} style={{ padding: '8px 16px', fontSize: 13 }}>Next →</button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 32, color: '#ef4444' }}>Failed to load pending changes.</div>
          )}
        </div>
      </div>

      {detail && (
        <DetailModal
          change={detail}
          onClose={() => setDetail(null)}
          onAction={load}
          actingRole={adminRole}
        />
      )}
    </AdminLayout>
  );
}
