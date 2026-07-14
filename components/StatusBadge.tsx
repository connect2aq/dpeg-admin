const STATUS_CLASS_NAMES: Record<string, string> = {
  Active: "status-active",
  Approved: "status-approved",
  Inactive: "status-inactive",
  InProgress: "status-inprogress",
  Pending: "status-inprogress",
  Rejected: "status-rejected",
  Redeemed: "status-redeemed",
  Sent: "status-active",
  UnderReview: "status-underreview",
};

export function getStatusBadgeClass(status: string) {
  return STATUS_CLASS_NAMES[status] ?? "status-inprogress";
}

export function formatStatusLabel(status: string) {
  return status.replace(/([A-Z])/g, " $1").trim();
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge ${getStatusBadgeClass(status)}`}>
      {formatStatusLabel(status)}
    </span>
  );
}

export function EditableStatusBadge({
  status,
  options,
  onChange,
  disabled = false,
}: {
  status: string;
  options: { value: string; label: string }[] | string[];
  onChange: (nextStatus: string) => void;
  disabled?: boolean;
}) {
  return (
    <span
      className="status-badge-select-wrap"
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={status}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`status-badge status-badge-select ${getStatusBadgeClass(status)}`}
      >
        {options?.map((option) => (
          <option
            key={typeof option === "string" ? option : option.value}
            value={typeof option === "string" ? option : option.value}
          >
            {formatStatusLabel(
              typeof option === "string" ? option : option.label,
            )}
          </option>
        ))}
      </select>
      <span className="status-badge-select-caret" aria-hidden="true">
        ▾
      </span>
    </span>
  );
}
