'use client';

/**
 * Reusable multi-series line chart for Agentic OS trend pages.
 *
 * Each series carries its own (date, value) pairs; the chart merges
 * them onto a shared x-axis (date string) so series with missing days
 * line up correctly. Colors fall back to a palette keyed by series
 * index when not supplied.
 *
 * OS-agnostic by design — no Health-specific keys. Keep it that way.
 */

import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  CHART_LEGEND_STYLE,
  CHART_PALETTE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from '@/lib/design/chart-tokens';

export interface TrendSeries {
  /** Stable key used as the y-axis data key for this series. */
  key: string;
  /** Display label shown in tooltip + legend. */
  label: string;
  /** Sorted (asc) data points. */
  data: { date: string; value: number | null }[];
  /** Optional hex/rgb color. When omitted, falls back to the palette. */
  color?: string;
}

export interface TrendChartProps {
  series: TrendSeries[];
  /** Pixel height of the chart container. Default 280. */
  height?: number;
  /** Explicit y-axis bounds; auto when undefined. */
  yDomain?: [number, number];
  /** Optional empty-state message when every series is empty. */
  emptyLabel?: string;
}

/** Chart palette sourced from `lib/design/chart-tokens.ts` so changes to
 * the design system propagate without editing every chart. */
const FALLBACK_COLORS = CHART_PALETTE;

/** Merge series into a single row-per-date dataset for recharts. */
function mergeSeries(series: TrendSeries[]): Record<string, number | string | null>[] {
  const byDate = new Map<string, Record<string, number | string | null>>();
  for (const s of series) {
    for (const point of s.data) {
      const row = byDate.get(point.date) ?? { date: point.date };
      row[s.key] = point.value;
      byDate.set(point.date, row);
    }
  }
  return Array.from(byDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

export function TrendChart({
  series,
  height = 280,
  yDomain,
  emptyLabel = 'No data in this window yet.',
}: TrendChartProps) {
  const merged = useMemo(() => mergeSeries(series), [series]);
  const hasData = merged.length > 0 && series.some((s) => s.data.length > 0);

  if (!hasData) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border-subtle bg-surface-0/40 text-xs text-text-secondary"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            stroke={CHART_AXIS_STROKE}
            tick={{ fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            stroke={CHART_AXIS_STROKE}
            tick={{ fontSize: 11 }}
            tickLine={false}
            domain={yDomain ?? ['auto', 'auto']}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
          />
          <Legend
            wrapperStyle={CHART_LEGEND_STYLE}
            iconType="line"
          />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
