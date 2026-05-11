export function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    Active: 'status-active',
    Inactive: 'status-inactive',
    InProgress: 'status-inprogress',
    UnderReview: 'status-underreview',
    Rejected: 'status-rejected',
  };
  return (
    <span className={`status-badge ${cls[status] ?? 'status-inprogress'}`}>
      {status.replace(/([A-Z])/g, ' $1').trim()}
    </span>
  );
}
