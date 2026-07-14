const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  year: "2-digit",
});

const shortDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const shortDateTimeSecondsFormatter = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function parseDate(value: string | number | Date) {
  return value instanceof Date ? value : new Date(value);
}

export function formatShortDate(value: string | number | Date) {
  return shortDateFormatter.format(parseDate(value));
}

export function formatShortDateTime(
  value: string | number | Date,
  options?: { seconds?: boolean },
) {
  return (options?.seconds
    ? shortDateTimeSecondsFormatter
    : shortDateTimeFormatter
  ).format(parseDate(value));
}
