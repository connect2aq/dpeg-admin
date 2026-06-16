import type { PendingChangeItem } from '@/lib/api';

export function PendingBadge({ item }: { item: PendingChangeItem }) {
  const isChecked = item.status === 'Checked';
  const title = isChecked
    ? `${item.operationType} submitted by ${item.makerName}, checked by ${item.checkerName ?? '—'} — awaiting approval`
    : `${item.operationType} submitted by ${item.makerName} — awaiting checker review`;
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        marginLeft: 6,
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
        background: isChecked ? '#dbeafe' : '#fef3c7',
        color: isChecked ? '#1d4ed8' : '#92400e',
      }}
    >
      {isChecked ? '✓ Checked · Awaiting Approval' : '⏳ Pending Approval'}
    </span>
  );
}
