"use client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { CopilotErrorBoundary } from "./CopilotErrorBoundary";
import type { ChartSpec } from "@/lib/copilotChartSpec";

// Reuses the app's existing chart visual language (see the Dashboard page's charts,
// the only other Recharts usage in this app) rather than inventing a new look. Cycled
// via modulo the same way Dashboard's own PIE_COLORS array is, extended to 6 entries to
// cover MAX_CHART_SERIES.
const PALETTE = ["#699172", "#b8923a", "#0e3416", "#6366f1", "#10b981", "#ef4444"];
const AXIS_TICK = { fontSize: 11, fill: "#94a3b8" };

function formatValue(value: unknown): string {
  if (typeof value === "number") return value.toLocaleString();
  return value == null ? "" : String(value);
}

function renderBarOrLine(spec: ChartSpec) {
  const Chart = spec.type === "bar" ? BarChart : LineChart;
  return (
    <Chart data={spec.data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
      <XAxis dataKey={spec.xKey} tick={AXIS_TICK} />
      <YAxis tick={AXIS_TICK} allowDecimals={false} />
      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: unknown) => [formatValue(v), ""]} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
      {spec.series.map((s, i) =>
        spec.type === "bar" ? (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={PALETTE[i % PALETTE.length]} radius={[3, 3, 0, 0]} />
        ) : (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={{ r: 4, fill: PALETTE[i % PALETTE.length] }}
          />
        ),
      )}
    </Chart>
  );
}

function renderPie(spec: ChartSpec) {
  const valueKey = spec.series[0].key;
  return (
    <PieChart>
      <Pie
        data={spec.data}
        dataKey={valueKey}
        nameKey={spec.xKey}
        cx="50%"
        cy="50%"
        outerRadius={70}
        label={(entry: { name?: string; percent?: number }) => `${entry.name ?? ""} ${Math.round((entry.percent ?? 0) * 100)}%`}
        labelLine={false}
      >
        {spec.data.map((_, i) => (
          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
        ))}
      </Pie>
      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: unknown, name: unknown) => [formatValue(v), String(name ?? "")]} />
    </PieChart>
  );
}

function CopilotChartInner({ spec }: { spec: ChartSpec }) {
  return (
    <div className="card" style={{ marginTop: 8, marginBottom: 8 }}>
      {spec.title && <div style={{ fontSize: 14, fontWeight: 700, color: "#0e3416", marginBottom: 16 }}>{spec.title}</div>}
      <ResponsiveContainer width="100%" height={220}>
        {spec.type === "pie" ? renderPie(spec) : renderBarOrLine(spec)}
      </ResponsiveContainer>
    </div>
  );
}

// A second, LOCAL error boundary -- the app-level one only wraps the whole
// ExecutiveCopilotCard, so an uncaught Recharts throw (it can happen on edge-case inputs
// even when types are satisfied) would otherwise blow away the entire conversation, not
// just this one chart.
export default function CopilotChart({ spec }: { spec: ChartSpec }) {
  return (
    <CopilotErrorBoundary
      fallback={<div style={{ fontSize: 12, color: "#94a3b8", padding: "8px 0" }}>Couldn&apos;t render this chart.</div>}
    >
      <CopilotChartInner spec={spec} />
    </CopilotErrorBoundary>
  );
}
