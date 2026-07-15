'use client';
import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { PaginationControls } from '@/components/PaginationControls';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { SortableTh } from '@/components/SortableTh';
import { adminApi, type AdminRole, type PendingChangeItem, type PendingChangeDetail, type PagedResult, type ApplicationDetail, type RedemptionDetail } from '@/lib/api';
import { canDecidePendingChange } from '@/lib/permissions';
import { encodeMultiFilterValue, hasMultiFilterValue } from '@/lib/filterUtils';
import type { QueryParams } from '@/lib/apiContracts';

const STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
const ENTITY_TYPES = ['Investment', 'Redemption', 'Distribution', 'BulkUsers', 'BulkApplications', 'BulkRedemptions'];
const PAGE_SIZE = 20;

// ── Field definitions (payload keys are PascalCase — C# JsonSerializer default) ──

type FieldDef = {
  key: string;
  label: string;
  getCurrent?: (r: ApplicationDetail | RedemptionDetail) => string;
};

const INV_FIELDS: FieldDef[] = [
  { key: 'InvestorType',           label: 'Investor Type',           getCurrent: r => (r as ApplicationDetail).investorType ?? '' },
  { key: 'InvestmentType',         label: 'Investment Type',         getCurrent: r => (r as ApplicationDetail).investmentType ?? '' },
  { key: 'EntitySubType',          label: 'Entity Sub Type',         getCurrent: r => (r as ApplicationDetail).entitySubType ?? '' },
  { key: 'EffectiveDate',          label: 'Effective Date',          getCurrent: r => (r as ApplicationDetail).effectiveDate ?? '' },
  { key: 'SubmittedAt',            label: 'Submitted At',            getCurrent: r => (r as ApplicationDetail).submittedAt ?? '' },
  { key: 'FirstName',              label: 'First Name',              getCurrent: r => (r as ApplicationDetail).investorProfile?.firstName ?? '' },
  { key: 'LastName',               label: 'Last Name',               getCurrent: r => (r as ApplicationDetail).investorProfile?.lastName ?? '' },
  { key: 'Phone',                  label: 'Phone',                   getCurrent: r => (r as ApplicationDetail).investorProfile?.phone ?? '' },
  { key: 'DateOfBirth',            label: 'Date of Birth',           getCurrent: r => (r as ApplicationDetail).investorProfile?.dateOfBirth ?? '' },
  { key: 'StreetAddress',          label: 'Street Address',          getCurrent: r => (r as ApplicationDetail).investorProfile?.addressLine1 ?? '' },
  { key: 'City',                   label: 'City',                    getCurrent: r => (r as ApplicationDetail).investorProfile?.city ?? '' },
  { key: 'State',                  label: 'State',                   getCurrent: r => (r as ApplicationDetail).investorProfile?.state ?? '' },
  { key: 'ZipCode',                label: 'Zip Code',                getCurrent: r => (r as ApplicationDetail).investorProfile?.zipCode ?? '' },
  { key: 'Citizenship',            label: 'Citizenship',             getCurrent: r => (r as ApplicationDetail).investorProfile?.citizenship ?? '' },
  { key: 'Employer',               label: 'Employer',                getCurrent: r => (r as ApplicationDetail).investorProfile?.employer ?? '' },
  { key: 'EntityName',             label: 'Entity Name',             getCurrent: r => (r as ApplicationDetail).investorProfile?.entityName ?? '' },
  { key: 'EIN',                    label: 'EIN',                     getCurrent: r => (r as ApplicationDetail).investorProfile?.ein ?? '' },
  { key: 'StateFormation',         label: 'State of Formation',      getCurrent: r => (r as ApplicationDetail).investorProfile?.stateFormation ?? '' },
  { key: 'SignatoryName',          label: 'Signatory Name',          getCurrent: r => (r as ApplicationDetail).investorProfile?.signatoryName ?? '' },
  { key: 'SignatoryTitle',         label: 'Signatory Title',         getCurrent: r => (r as ApplicationDetail).investorProfile?.signatoryTitle ?? '' },
  { key: 'NumUnits',               label: 'Number of Units',         getCurrent: r => String((r as ApplicationDetail).investment?.numUnits ?? '') },
  { key: 'TotalAmount',            label: 'Total Amount ($)',        getCurrent: r => String((r as ApplicationDetail).investment?.totalAmount ?? '') },
  { key: 'PPMRefNO',               label: 'PPM Ref #',               getCurrent: r => String((r as ApplicationDetail).investment?.ppmRefNO ?? '') },
  { key: 'PaymentMethod',          label: 'Payment Method',          getCurrent: r => (r as ApplicationDetail).investment?.paymentMethod ?? '' },
  { key: 'DistributionPreference', label: 'Distribution Preference', getCurrent: r => (r as ApplicationDetail).investment?.distributionPreference ?? '' },
  { key: 'BankName',               label: 'Bank Name',               getCurrent: r => (r as ApplicationDetail).investment?.bankName ?? '' },
  { key: 'AccHolder',              label: 'Account Holder',          getCurrent: r => (r as ApplicationDetail).investment?.accHolder ?? '' },
  { key: 'RoutingNumber',          label: 'Routing Number',          getCurrent: r => String((r as ApplicationDetail).investment?.routingNumber ?? '') },
  { key: 'AccNumber',              label: 'Account Number',          getCurrent: r => (r as ApplicationDetail).investment?.accNumber ?? '' },
];

const REDEEM_FIELDS: FieldDef[] = [
  { key: 'SellingPartnerName',      label: 'Selling Partner Name',      getCurrent: r => (r as RedemptionDetail).sellingPartnerName ?? '' },
  { key: 'InvestorType',            label: 'Investor Type',             getCurrent: r => (r as RedemptionDetail).investorType ?? '' },
  { key: 'TotalUnitsOwned',         label: 'Total Units Owned',         getCurrent: r => (r as RedemptionDetail).totalUnitsOwned ?? '' },
  { key: 'UnitsToRedeem',           label: 'Units to Redeem',           getCurrent: r => (r as RedemptionDetail).unitsToRedeem ?? '' },
  { key: 'OriginalPurchaseDate',    label: 'Original Purchase Date',    getCurrent: r => (r as RedemptionDetail).originalPurchaseDate ?? '' },
  { key: 'AggregatePurchasePrice',  label: 'Aggregate Purchase Price',  getCurrent: r => (r as RedemptionDetail).aggregatePurchasePrice ?? '' },
  { key: 'ProratedPreferredReturn', label: 'Prorated Preferred Return', getCurrent: r => (r as RedemptionDetail).proratedPreferredReturn ?? '' },
  { key: 'EffectiveDate',           label: 'Effective Date',            getCurrent: r => (r as RedemptionDetail).effectiveDate ?? '' },
  { key: 'PrintedName',             label: 'Printed Name',              getCurrent: r => (r as RedemptionDetail).printedName ?? '' },
  { key: 'AddressLine1',            label: 'Address Line 1',            getCurrent: r => (r as RedemptionDetail).addressLine1 ?? '' },
  { key: 'AddressLine2',            label: 'Address Line 2',            getCurrent: r => (r as RedemptionDetail).addressLine2 ?? '' },
  { key: 'AddressLine3',            label: 'Address Line 3',            getCurrent: r => (r as RedemptionDetail).addressLine3 ?? '' },
  { key: 'Email',                   label: 'Email',                     getCurrent: r => (r as RedemptionDetail).email ?? '' },
  { key: 'EntityName',              label: 'Entity Name',               getCurrent: r => (r as RedemptionDetail).entityName ?? '' },
  { key: 'SignatoryName',           label: 'Signatory Name',            getCurrent: r => (r as RedemptionDetail).signatoryName ?? '' },
  { key: 'SignatoryTitle',          label: 'Signatory Title',           getCurrent: r => (r as RedemptionDetail).signatoryTitle ?? '' },
  { key: 'Status',                  label: 'Status',                    getCurrent: r => (r as RedemptionDetail).status ?? '' },
];

const DIST_LABELS: Record<string, string> = {
  ApplicationId:         'Application ID',
  UserId:                'User ID',
  DistributionMonth:     'Distribution Month',
  TotalNetAmount:        'Total Net Amount ($)',
  PaymentStatus:         'Payment Status',
  PaidAt:                'Paid At',
  BankName:              'Bank Name',
  BankAccountHolderName: 'Account Holder Name',
  BankAccountNumber:     'Account Number',
  BankRoutingNumber:     'Routing Number',
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function isBlank(v: string): boolean {
  return v === '' || v === '0' || v === 'undefined' || v === 'null';
}

// ── StatusChip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    Pending:   { bg: '#fef3c7', color: '#92400e' },
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

// ── PayloadDiff — the core diff renderer ────────────────────────────────────

function PayloadDiff({ change, currentRecord, fetchingRecord }: {
  change: PendingChangeDetail;
  currentRecord: ApplicationDetail | RedemptionDetail | null;
  fetchingRecord: boolean;
}) {
  const { entityType, operationType } = change;

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(change.payloadJson); } catch { /**/ }

  // ── Bulk delete: just list the IDs ──
  if (entityType.startsWith('Bulk')) {
    let ids: number[] = [];
    try { ids = JSON.parse(change.payloadJson) as number[]; } catch { /**/ }
    const entityLabel = entityType === 'BulkUsers' ? 'user' : entityType === 'BulkApplications' ? 'application' : 'redemption';
    return (
      <div style={{ marginTop: 16, padding: 14, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          {ids.length} {entityLabel}(s) will be permanently deleted
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#7f1d1d', wordBreak: 'break-word' }}>
          IDs: {ids.join(', ')}
        </div>
      </div>
    );
  }

  // ── Distribution: no current-record fetch available — show payload with labels ──
  if (entityType === 'Distribution') {
    const entries = Object.entries(payload).filter(([, v]) => v !== null && v !== '' && v !== undefined);
    const isCreate = operationType === 'Create';
    const isDelete = operationType === 'Delete';
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
          color: isCreate ? '#065f46' : isDelete ? '#b91c1c' : '#92400e' }}>
          {isCreate ? 'New distribution values' : isDelete ? 'Distribution to delete' : 'Proposed distribution changes'}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '6px 10px', background: '#f8fafc', fontWeight: 600, color: '#475569', width: 200, fontSize: 12 }}>
                  {DIST_LABELS[k] ?? k}
                </td>
                <td style={{ padding: '6px 10px', color: '#1e293b', fontFamily: 'monospace', fontSize: 12 }}>{fmt(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Investment / Redemption ──
  const fields = entityType === 'Investment' ? INV_FIELDS : REDEEM_FIELDS;

  // Create: show non-empty payload values
  if (operationType === 'Create') {
    const nonEmpty = fields.filter(f => {
      const v = payload[f.key];
      return v !== null && v !== undefined && v !== '' && v !== 0;
    });
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#065f46', marginBottom: 6 }}>
          New record — {nonEmpty.length} field{nonEmpty.length !== 1 ? 's' : ''} set
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, border: '1px solid #d1fae5', borderRadius: 6, overflow: 'hidden' }}>
          <tbody>
            {nonEmpty.map(f => (
              <tr key={f.key} style={{ borderBottom: '1px solid #f0fdf4' }}>
                <td style={{ padding: '6px 10px', background: '#f0fdf4', fontWeight: 600, color: '#475569', width: 200, fontSize: 12 }}>{f.label}</td>
                <td style={{ padding: '6px 10px', color: '#065f46', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{fmt(payload[f.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Delete: show current record (what will be lost)
  if (operationType === 'Delete') {
    if (fetchingRecord) {
      return <div style={{ marginTop: 16, fontSize: 13, color: '#64748b' }}>Loading current record...</div>;
    }
    if (!currentRecord) {
      return <div style={{ marginTop: 16, fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Current record not available for preview.</div>;
    }
    const nonEmpty = fields.filter(f => f.getCurrent && !isBlank(f.getCurrent(currentRecord)));
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#b91c1c', marginBottom: 6 }}>
          This record will be permanently deleted:
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, border: '1px solid #fca5a5', borderRadius: 6, overflow: 'hidden' }}>
          <tbody>
            {nonEmpty.map(f => (
              <tr key={f.key} style={{ borderBottom: '1px solid #fff1f2' }}>
                <td style={{ padding: '6px 10px', background: '#fff1f2', fontWeight: 600, color: '#475569', width: 200, fontSize: 12 }}>{f.label}</td>
                <td style={{ padding: '6px 10px', color: '#b91c1c', fontFamily: 'monospace', fontSize: 12 }}>{f.getCurrent!(currentRecord)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Update: 3-column diff (Field | Before | After)
  if (operationType === 'Update') {
    if (fetchingRecord) {
      return <div style={{ marginTop: 16, fontSize: 13, color: '#64748b' }}>Loading current record for comparison...</div>;
    }

    type DiffRow = { f: FieldDef; oldVal: string; newVal: string; changed: boolean; hasAnyData: boolean };
    const rows: DiffRow[] = fields.map(f => {
      const oldVal = (currentRecord && f.getCurrent) ? f.getCurrent(currentRecord) : '';
      const newVal = payload[f.key] !== undefined ? fmt(payload[f.key]) : '';
      const changed = currentRecord !== null && oldVal !== newVal && !(isBlank(oldVal) && isBlank(newVal));
      const hasAnyData = !isBlank(oldVal) || !isBlank(newVal);
      return { f, oldVal: oldVal || '—', newVal: newVal || '—', changed, hasAnyData };
    });

    const changedRows = rows.filter(r => r.changed);
    const unchangedRows = rows.filter(r => !r.changed && r.hasAnyData);
    const thStyle = { padding: '7px 10px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em' };

    return (
      <div style={{ marginTop: 16 }}>
        {!currentRecord && (
          <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginBottom: 8 }}>
            Current record unavailable — showing proposed values only.
          </div>
        )}

        {/* Changed fields — always visible */}
        {changedRows.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#92400e', marginBottom: 6 }}>
              {changedRows.length} field{changedRows.length !== 1 ? 's' : ''} changed
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#fef3c7' }}>
                  <th style={{ ...thStyle, color: '#92400e', width: 170 }}>Field</th>
                  <th style={{ ...thStyle, color: '#b91c1c' }}>Before (current)</th>
                  <th style={{ ...thStyle, color: '#065f46' }}>After (proposed)</th>
                </tr>
              </thead>
              <tbody>
                {changedRows.map(({ f, oldVal, newVal }) => (
                  <tr key={f.key} style={{ background: '#fffbeb', borderBottom: '1px solid #fef3c7' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 700, color: '#475569' }}>{f.label}</td>
                    <td style={{ padding: '7px 10px', color: '#b91c1c', fontFamily: 'monospace', textDecoration: 'line-through' }}>{oldVal}</td>
                    <td style={{ padding: '7px 10px', color: '#065f46', fontFamily: 'monospace', fontWeight: 700 }}>{newVal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : currentRecord ? (
          <div style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic', marginBottom: 10 }}>
            No field differences detected between current record and payload.
          </div>
        ) : null}

        {/* Unchanged fields — collapsed */}
        {unchangedRows.length > 0 && (
          <details>
            <summary style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', cursor: 'pointer', userSelect: 'none', letterSpacing: '0.03em' }}>
              {unchangedRows.length} unchanged field{unchangedRows.length !== 1 ? 's' : ''} (no change)
            </summary>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ ...thStyle, color: '#94a3b8', width: 170 }}>Field</th>
                  <th style={{ ...thStyle, color: '#94a3b8' }}>Value (same in both)</th>
                </tr>
              </thead>
              <tbody>
                {unchangedRows.map(({ f, oldVal }) => (
                  <tr key={f.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '5px 10px', color: '#94a3b8', fontWeight: 500 }}>{f.label}</td>
                    <td style={{ padding: '5px 10px', color: '#94a3b8', fontFamily: 'monospace' }}>{oldVal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
    );
  }

  return null;
}

// ── DetailModal ─────────────────────────────────────────────────────────────

function DetailModal({ change, onClose, onAction, actingRole, currentUserId }: {
  change: PendingChangeDetail;
  onClose: () => void;
  onAction: () => void;
  actingRole: AdminRole | undefined;
  currentUserId: number | undefined;
}) {
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [currentRecord, setCurrentRecord] = useState<ApplicationDetail | RedemptionDetail | null>(null);
  const [fetchingRecord, setFetchingRecord] = useState(false);

  const needsCurrentRecord =
    (change.operationType === 'Update' || change.operationType === 'Delete') &&
    (change.entityType === 'Investment' || change.entityType === 'Redemption') &&
    !!change.entityId;

  useEffect(() => {
    if (!needsCurrentRecord) return;
    setFetchingRecord(true);
    const fetch = change.entityType === 'Investment'
      ? adminApi.application(change.entityId!)
      : adminApi.redemption(change.entityId!);
    fetch
      .then(r => { if (r.success && r.data) setCurrentRecord(r.data); })
      .finally(() => setFetchingRecord(false));
  }, [change.entityId, change.entityType, change.operationType, needsCurrentRecord]);

  const canApprove = canDecidePendingChange(actingRole);
  const canReject  = canApprove;
  const canCancel  = change.makerUserId === currentUserId;

  const doApprove = async () => {
    setBusy(true);
    const r = await adminApi.approveChange(change.id, note || undefined);
    if (r.success) { onAction(); onClose(); } else setMsg(r.message);
    setBusy(false);
  };
  const doReject = async () => {
    if (!reason.trim()) { setMsg('Rejection reason is required.'); return; }
    setBusy(true);
    const r = await adminApi.rejectChange(change.id, reason);
    if (r.success) { onAction(); onClose(); } else setMsg(r.message);
    setBusy(false);
  };
  const doCancel = async () => {
    setBusy(true);
    const r = await adminApi.cancelChange(change.id);
    if (r.success) { onAction(); onClose(); } else setMsg(r.message);
    setBusy(false);
  };

  const tdLabel = { padding: '7px 12px', background: '#f8fafc', fontWeight: 700, fontSize: 12, color: '#475569', width: 150, verticalAlign: 'top' as const, whiteSpace: 'nowrap' as const };
  const tdVal   = { padding: '7px 12px', fontSize: 13, color: '#1e293b', verticalAlign: 'top' as const, wordBreak: 'break-word' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '32px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'white', borderRadius: 12, width: 860, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', marginBottom: 40 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f2342', margin: 0 }}>Change #{change.id}</h2>
            <StatusChip status={change.status} />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>

          {/* Summary table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 4 }}>
            <tbody>
              <tr><td style={tdLabel}>Description</td><td style={tdVal}><strong>{change.description}</strong></td></tr>
              <tr><td style={tdLabel}>Operation</td><td style={tdVal}>{change.operationType} / {change.entityType}{change.entityId ? ` #${change.entityId}` : ''}</td></tr>
              <tr><td style={tdLabel}>Maker</td><td style={tdVal}>{change.makerName} <span style={{ color: '#94a3b8' }}>({change.makerEmail})</span></td></tr>
              <tr><td style={tdLabel}>Submitted</td><td style={tdVal}>{new Date(change.createdOn).toLocaleString()}</td></tr>
              {change.makerNote && <tr><td style={tdLabel}>Maker Note</td><td style={{ ...tdVal, fontStyle: 'italic' }}>{change.makerNote}</td></tr>}
              {change.checkerName && (
                <tr><td style={tdLabel}>Checked By</td>
                  <td style={tdVal}>{change.checkerName} @ {change.checkedAt ? new Date(change.checkedAt).toLocaleString() : '—'}
                    {change.checkerNote && <span style={{ display: 'block', fontStyle: 'italic', color: '#64748b', marginTop: 2 }}>{change.checkerNote}</span>}
                  </td>
                </tr>
              )}
              {change.approverName && (
                <tr><td style={tdLabel}>Approved By</td>
                  <td style={tdVal}>{change.approverName} @ {change.approvedAt ? new Date(change.approvedAt).toLocaleString() : '—'}
                    {change.approverNote && <span style={{ display: 'block', fontStyle: 'italic', color: '#64748b', marginTop: 2 }}>{change.approverNote}</span>}
                  </td>
                </tr>
              )}
              {change.rejectedByName && (
                <tr><td style={tdLabel}>Rejected By</td>
                  <td style={tdVal}>{change.rejectedByName} @ {change.rejectedAt ? new Date(change.rejectedAt).toLocaleString() : '—'}
                    {change.rejectionReason && <span style={{ display: 'block', color: '#b91c1c', fontWeight: 600, marginTop: 2 }}>{change.rejectionReason}</span>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Diff view */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>
            <PayloadDiff change={change} currentRecord={currentRecord} fetchingRecord={fetchingRecord} />
          </div>

          {/* Action area */}
          {change.status === 'Pending' && (canApprove || canCancel) && (
            <div style={{ marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Note (optional for Approve — required for Reject)
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add a note..."
                  style={{ width: '100%', padding: '8px 11px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, resize: 'vertical', minHeight: 54, boxSizing: 'border-box' }}
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
                    style={{ width: '100%', padding: '8px 11px', border: '1.5px solid #fca5a5', borderRadius: 6, fontSize: 13, resize: 'vertical', minHeight: 44, boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {canApprove && (
                  <button onClick={doApprove} disabled={busy}
                    style={{ padding: '9px 20px', background: '#065f46', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                    ✓ Approve & Execute
                  </button>
                )}
                {canReject && (
                  <button onClick={doReject} disabled={busy}
                    style={{ padding: '9px 20px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                    ✗ Reject
                  </button>
                )}
                {canCancel && (
                  <button onClick={doCancel} disabled={busy}
                    style={{ padding: '9px 20px', background: 'white', color: '#64748b', border: '1.5px solid #e2e8f0', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer' }}>
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

// ── Main page ────────────────────────────────────────────────────────────────

export default function PendingApprovalsPage() {
  const { user: authUser } = useAdminAuth();
  const adminRole = authUser?.adminRole;

  const [result, setResult] = useState<PagedResult<PendingChangeItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string[]>([]);
  const [entityType, setEntityType] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<PendingChangeDetail | null>(null);
  const [sortOn, setSortOn] = useState('createdOn');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (key: string) => {
    if (sortOn === key) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortOn(key); setSortDirection('asc'); }
    setPage(1);
  };

  const load = useCallback(() => {
    setLoading(true);
    const params: QueryParams = { page, pageSize: PAGE_SIZE, sortOn, sortDirection };
    const encodedStatus = encodeMultiFilterValue(status);
    if (encodedStatus) params.status = encodedStatus;
    const encodedEntityType = encodeMultiFilterValue(entityType);
    if (encodedEntityType) params.entityType = encodedEntityType;
    adminApi.getPendingChanges(params)
      .then(r => { if (r.success) setResult(r.data); })
      .finally(() => setLoading(false));
  }, [page, status, entityType, sortOn, sortDirection]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: number) => {
    const r = await adminApi.getPendingChange(id);
    if (r.success && r.data) setDetail(r.data);
  };

  return (
    <AdminLayout>
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416' }}>Pending Approvals</h1>
          <span style={{ fontSize: 13, color: '#64748b' }}>Role: <strong style={{ color: '#b8923a' }}>{adminRole}</strong></span>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <MultiSelectFilter
            allLabel="All Statuses"
            buttonLabel="Status"
            options={STATUSES.map(s => ({ value: s, label: s }))}
            selectedValues={status}
            onChange={next => { setStatus(next); setPage(1); }}
            minWidth={180}
          />
          <MultiSelectFilter
            allLabel="All Types"
            buttonLabel="Type"
            options={ENTITY_TYPES.map(t => ({ value: t, label: t }))}
            selectedValues={entityType}
            onChange={next => { setEntityType(next); setPage(1); }}
            minWidth={200}
          />
          {(hasMultiFilterValue(status) || hasMultiFilterValue(entityType)) && (
            <button onClick={() => { setStatus([]); setEntityType([]); setPage(1); }}
              style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white', cursor: 'pointer', color: '#64748b' }}>Reset</button>
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
                      <SortableTh label="ID" sortKey="id" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableTh label="Submitted" sortKey="createdOn" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableTh label="Type" sortKey="entityType" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableTh label="Description" sortKey="description" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableTh label="Maker" sortKey="makerName" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableTh label="Checker" sortKey="checkerName" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableTh label="Status" sortKey="status" sortOn={sortOn} sortDirection={sortDirection} onSort={toggleSort} />
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>No pending changes found</td></tr>
                    ) : result.items.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#b8923a' }}>#{item.id}</td>
                        <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{new Date(item.createdOn).toLocaleDateString()}</td>
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

              <PaginationControls
                page={page}
                totalPages={result.totalPages}
                onPageChange={setPage}
                summary={`${result.totalCount} changes`}
                containerStyle={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9' }}
                buttonClassName="btn-secondary"
                buttonStyle={{ padding: '8px 16px', fontSize: 13 }}
              />
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
          currentUserId={authUser?.userId}
        />
      )}
    </AdminLayout>
  );
}
