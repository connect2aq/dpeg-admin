'use client';

export function SortableTh({
  label,
  sortKey,
  sortOn,
  sortDirection,
  onSort,
  style,
}: {
  label: string;
  sortKey: string;
  sortOn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (key: string) => void;
  style?: React.CSSProperties;
}) {
  const active = sortOn === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      title="Click to sort"
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}
    >
      {label}
      <span style={{ marginLeft: 5, fontSize: 10, color: active ? '#b8923a' : '#cbd5e1' }}>
        {active ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  );
}
