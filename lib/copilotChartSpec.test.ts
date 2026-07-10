import { describe, it, expect } from "vitest";
import { parseChartSpec } from "./copilotChartSpec";

function json(obj: unknown): string {
  return JSON.stringify(obj);
}

describe("parseChartSpec", () => {
  it("parses a valid bar spec", () => {
    const spec = parseChartSpec(
      json({
        type: "bar",
        title: "Applications by Month",
        xKey: "month",
        series: [
          { key: "total", label: "Submitted" },
          { key: "approved", label: "Approved" },
        ],
        data: [
          { month: "Jan", total: 12, approved: 9 },
          { month: "Feb", total: 15, approved: 11 },
        ],
      }),
    );
    expect(spec).toEqual({
      type: "bar",
      title: "Applications by Month",
      xKey: "month",
      series: [
        { key: "total", label: "Submitted" },
        { key: "approved", label: "Approved" },
      ],
      data: [
        { month: "Jan", total: 12, approved: 9 },
        { month: "Feb", total: 15, approved: 11 },
      ],
    });
  });

  it("parses a valid line spec", () => {
    const spec = parseChartSpec(
      json({
        type: "line",
        xKey: "month",
        series: [{ key: "deployed", label: "Deployed" }],
        data: [
          { month: "Jan", deployed: 1250000 },
          { month: "Feb", deployed: 1400000 },
        ],
      }),
    );
    expect(spec?.type).toBe("line");
    expect(spec?.data).toHaveLength(2);
  });

  it("parses a valid pie spec", () => {
    const spec = parseChartSpec(
      json({
        type: "pie",
        xKey: "type",
        series: [{ key: "count", label: "Investors" }],
        data: [
          { type: "Individual", count: 18 },
          { type: "Entity", count: 9 },
        ],
      }),
    );
    expect(spec?.type).toBe("pie");
  });

  it("rejects an invalid or missing type", () => {
    expect(parseChartSpec(json({ type: "scatter", xKey: "x", series: [{ key: "y", label: "Y" }], data: [{ x: 1, y: 2 }] }))).toBeNull();
    expect(parseChartSpec(json({ xKey: "x", series: [{ key: "y", label: "Y" }], data: [{ x: 1, y: 2 }] }))).toBeNull();
  });

  it("rejects a pie spec with more than one series", () => {
    const spec = parseChartSpec(
      json({
        type: "pie",
        xKey: "type",
        series: [
          { key: "count", label: "Count" },
          { key: "amount", label: "Amount" },
        ],
        data: [{ type: "Individual", count: 18, amount: 100 }],
      }),
    );
    expect(spec).toBeNull();
  });

  it("rejects empty series or empty data", () => {
    expect(parseChartSpec(json({ type: "bar", xKey: "month", series: [], data: [{ month: "Jan", total: 1 }] }))).toBeNull();
    expect(parseChartSpec(json({ type: "bar", xKey: "month", series: [{ key: "total", label: "Total" }], data: [] }))).toBeNull();
  });

  it("defaults a series' label to its key when omitted", () => {
    const spec = parseChartSpec(
      json({ type: "bar", xKey: "month", series: [{ key: "total" }], data: [{ month: "Jan", total: 5 }] }),
    );
    expect(spec?.series).toEqual([{ key: "total", label: "total" }]);
  });

  it("drops only the row missing an xKey value or a non-numeric series value, keeping the rest", () => {
    const spec = parseChartSpec(
      json({
        type: "bar",
        xKey: "month",
        series: [{ key: "total", label: "Total" }],
        data: [
          { month: "Jan", total: 5 },
          { month: "Feb", total: "not a number" },
          { total: 7 }, // missing xKey value
          { month: "Mar", total: 9 },
        ],
      }),
    );
    expect(spec?.data).toEqual([
      { month: "Jan", total: 5 },
      { month: "Mar", total: 9 },
    ]);
  });

  it("returns null (not an empty chart) when every row is invalid", () => {
    const spec = parseChartSpec(
      json({
        type: "bar",
        xKey: "month",
        series: [{ key: "total", label: "Total" }],
        data: [{ month: "Jan", total: "bad" }, { total: 5 }],
      }),
    );
    expect(spec).toBeNull();
  });

  it("coerces a numeric string series value instead of rejecting it", () => {
    const spec = parseChartSpec(
      json({ type: "bar", xKey: "month", series: [{ key: "total", label: "Total" }], data: [{ month: "Jan", total: "1400000" }] }),
    );
    expect(spec?.data).toEqual([{ month: "Jan", total: 1400000 }]);
  });

  it("truncates data beyond MAX_CHART_DATA_POINTS for bar/line rather than rejecting", () => {
    const data = Array.from({ length: 60 }, (_, i) => ({ month: `M${i}`, total: i }));
    const spec = parseChartSpec(json({ type: "line", xKey: "month", series: [{ key: "total", label: "Total" }], data }));
    expect(spec?.data).toHaveLength(50);
  });

  it("truncates pie slices to a tighter MAX_PIE_SLICES", () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ type: `T${i}`, count: i + 1 }));
    const spec = parseChartSpec(json({ type: "pie", xKey: "type", series: [{ key: "count", label: "Count" }], data }));
    expect(spec?.data).toHaveLength(8);
  });

  it("truncates series beyond MAX_CHART_SERIES", () => {
    const series = Array.from({ length: 10 }, (_, i) => ({ key: `s${i}`, label: `S${i}` }));
    const row: Record<string, unknown> = { month: "Jan" };
    series.forEach((s) => (row[s.key] = 1));
    const spec = parseChartSpec(json({ type: "bar", xKey: "month", series, data: [row] }));
    expect(spec?.series).toHaveLength(6);
  });

  it("returns null for malformed JSON without throwing", () => {
    expect(() => parseChartSpec("{not valid json")).not.toThrow();
    expect(parseChartSpec("{not valid json")).toBeNull();
    expect(parseChartSpec('{"type":"bar",}')).toBeNull(); // trailing comma
  });

  it("returns null for a ```table-shaped JSON (no cross-contamination between conventions)", () => {
    const spec = parseChartSpec(json({ columns: ["Rank", "Investor"], rows: [{ Rank: "1", Investor: "Alice" }] }));
    expect(spec).toBeNull();
  });
});
