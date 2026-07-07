// Parses and validates the model's ```chart fenced-JSON convention (see the prompt rule
// in lib/executiveCopilot/tools.ts) into a ChartSpec components/CopilotChart.tsx can
// render directly. Pulled out of any component file on purpose -- this repo's vitest
// config (environment: "node", include: "**/*.test.ts") has no jsdom/React-rendering
// test infra, so logic like this has to live outside a .tsx file to stay unit-testable,
// exactly like lib/copilotCitationLinking.ts was pulled out of CopilotMarkdownAnswer.tsx.
//
// Unlike the ```table convention's recoverPartialTable (which salvages individual rows
// from otherwise-malformed JSON), a chart with unparseable JSON isn't worth partially
// reconstructing -- parseChartSpec returns null on any doubt, and the caller falls back
// to showing the raw fenced block as plain code, never a blank or crashed render.

export interface ChartSeries {
  key: string;
  label: string;
}

export interface ChartSpec {
  type: "bar" | "line" | "pie";
  title?: string;
  xKey: string;
  series: ChartSeries[];
  data: Array<Record<string, unknown>>;
}

const CHART_TYPES = new Set(["bar", "line", "pie"]);

// Illegible past these sizes -- silently truncated rather than rejected, since a
// too-large-but-otherwise-valid chart is still useful truncated (unlike a malformed one).
const MAX_CHART_DATA_POINTS = 50;
const MAX_CHART_SERIES = 6;
const MAX_PIE_SLICES = 8; // tighter than MAX_CHART_DATA_POINTS -- a 50-slice pie is never legible

// Accepts a real JSON number OR a numeric string ("1400000") coerced to one -- models
// occasionally emit a quoted number despite the prompt rule asking for a bare one, and
// silently accepting it is more resilient than dropping the whole chart over a
// formatting slip, consistent with this codebase's "lenient on formatting, strict on
// structure" pattern elsewhere.
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function parseChartSpec(jsonText: string): ChartSpec | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const spec = parsed as Record<string, unknown>;

  if (typeof spec.type !== "string" || !CHART_TYPES.has(spec.type)) return null;
  const type = spec.type as ChartSpec["type"];

  if (typeof spec.xKey !== "string" || spec.xKey.trim() === "") return null;
  const xKey = spec.xKey;

  if (!Array.isArray(spec.series) || spec.series.length === 0) return null;
  const series: ChartSeries[] = [];
  for (const raw of spec.series) {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    if (typeof s.key !== "string" || s.key.trim() === "") return null;
    const label = typeof s.label === "string" && s.label.trim() !== "" ? s.label : s.key;
    series.push({ key: s.key, label });
  }
  if (series.length === 0) return null;

  // Pie is a shape variant of the same schema, not a separate one -- ambiguous
  // multi-series pie specs are rejected outright rather than silently picking the first.
  if (type === "pie" && series.length !== 1) return null;

  const cappedSeries = series.slice(0, MAX_CHART_SERIES);

  if (!Array.isArray(spec.data) || spec.data.length === 0) return null;
  const rows: Array<Record<string, unknown>> = [];
  for (const raw of spec.data) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    if (row[xKey] === undefined || row[xKey] === null || row[xKey] === "") continue;

    const cleanRow: Record<string, unknown> = { [xKey]: row[xKey] };
    let allSeriesValid = true;
    for (const s of cappedSeries) {
      const n = toFiniteNumber(row[s.key]);
      if (n === null) {
        allSeriesValid = false;
        break;
      }
      cleanRow[s.key] = n;
    }
    if (!allSeriesValid) continue;
    rows.push(cleanRow);
  }
  if (rows.length === 0) return null;

  const cap = type === "pie" ? MAX_PIE_SLICES : MAX_CHART_DATA_POINTS;
  const cappedRows = rows.slice(0, cap);

  const title = typeof spec.title === "string" && spec.title.trim() !== "" ? spec.title : undefined;

  return { type, title, xKey, series: cappedSeries, data: cappedRows };
}
