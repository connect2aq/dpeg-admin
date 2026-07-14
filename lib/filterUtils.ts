export type MultiFilterOption = {
  label: string;
  value: string;
};

export function parseMultiFilterValue(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function encodeMultiFilterValue(values: string[]): string[] | undefined {
  if (values.length === 0) return undefined;
  return values;
}

export function hasMultiFilterValue(values: string[]) {
  return values.length > 0;
}
