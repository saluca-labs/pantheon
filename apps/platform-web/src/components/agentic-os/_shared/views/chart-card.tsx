'use client';

/**
 * ChartCard — a `DashboardWidget`-composed wrapper around Recharts.
 *
 * Standardized framing for a trend visualization: title rail + optional
 * range toggle + optional actions + the chart body. Supports line / bar
 * / area chart types over the same `ChartSeries` shape. ALL colors come
 * from `lib/design/chart-tokens.ts` — never hardcoded — so design-system
 * changes propagate without editing every chart.
 *
 * Empty + loading states are first-class: empty composes `EmptyState`,
 * loading renders a shimmer skeleton per the visual-language contract.
 *
 * Wave B.1 primitive. Standalone — wired into OS pages in Wave C.
 *
 * Spec sources:
 *  - PANTHEON_UI_DEPTH_WAVE_PLAN.md §2.11
 *  - _design/visual-language.md "Loading / empty / error states"
 *  - lib/design/chart-tokens.ts (the JS-string color bridge)
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
import { DashboardWidget } from './dashboard-widget';
import type { DashboardWidgetProps } from './dashboard-widget';
import { EmptyState } from './empty-state';
import type { EmptyStateProps } from './empty-state';
import { Skeleton } from './skeleton';

export type ChartKind = 'line' | 'bar' | 'area';

/** One plotted series. Mirrors `TrendChart`'s `TrendSeries` shape. */
export interface ChartSeries {
  /** Stable key used as the data key for this series. */
  key: string;
  /** Display label shown in tooltip + legend. */
  label: string;
  /** Sorted (asc) data points. `null` values create gaps. */
  data: { x: string; y: number | null }[];
  /** Optional hex color. Falls back to the chart-token palette by index. */
  color?: string;
}

/** A selectable time range (e.g. 7d / 30d / 90d). */
export interface ChartRange {
  /** Stable identifier passed back through `onRangeChange`. */
  key: string;
  /** Toggle button copy. */
  label: string;
}

export interface ChartCardProps {
  /** Card title — forwarded to the composed `DashboardWidget`. */
  title: ReactNode;
  /**
   * W-E.4: optional screen-reader-only description of what the chart
   * conveys (e.g. "Login attempts trending up 12% over the last 30 days").
   * Rendered as a hidden span inside the chart body so SR users get a
   * textual fallback for the canvas. Visible title remains the label.
   */
  summary?: string;
  /** Optional leading icon (Lucide element). */
  icon?: ReactNode;
  /** Series to plot. */
  series: ChartSeries[];
  /** Chart kind. Default `line`. */
  kind?: ChartKind;
  /** Pixel height of the chart body. Default 240. */
  height?: number;
  /** Explicit y-axis bounds; auto when undefined. */
  yDomain?: [number, number];
  /**
   * Optional time-range toggle. When supplied, renders pill buttons in
   * the header and calls `onRangeChange` on selection.
   */
  ranges?: ChartRange[];
  /** Currently-selected range key (controlled). Defaults to first range. */
  activeRange?: string;
  /** Range-change handler — required if `ranges` is supplied. */
  onRangeChange?: (rangeKey: string) => void;
  /** Extra header actions (download, fullscreen) rendered after the range toggle. */
  actions?: ReactNode;
  /** Optional footer node — forwarded to `DashboardWidget`. */
  footer?: ReactNode;
  /** Emphasis variant — forwarded to `DashboardWidget`. */
  variant?: DashboardWidgetProps['variant'];
  /** Per-OS slug — forwarded to `DashboardWidget` for accent tinting. */
  osSlug?: DashboardWidgetProps['osSlug'];
  /** Loading flag — renders a shimmer skeleton instead of the chart. */
  loading?: boolean;
  /**
   * Empty-state config used when every series is empty. Pass `false` to
   * render an inline minimal message instead of the full `EmptyState`.
   */
  emptyState?: Partial<EmptyStateProps> | false;
  /** Extra classes on the root element. */
  className?: string;
}

/** Merge series into a single row-per-x dataset Recharts can consume. */
function mergeSeries(
  series: ChartSeries[],
): Record<string, number | string | null>[] {
  const byX = new Map<string, Record<string, number | string | null>>();
  for (const s of series) {
    for (const point of s.data) {
      const row = byX.get(point.x) ?? { x: point.x };
      row[s.key] = point.y;
      byX.set(point.x, row);
    }
  }
  return Array.from(byX.values()).sort((a, b) =>
    String(a.x).localeCompare(String(b.x)),
  );
}

function RangeToggle({
  ranges,
  active,
  onChange,
}: {
  ranges: ChartRange[];
  active: string;
  onChange?: (key: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md bg-surface-0 p-0.5"
      role="group"
      aria-label="Time range"
      data-testid="chart-card-range-toggle"
    >
      {ranges.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => onChange?.(r.key)}
          aria-pressed={r.key === active}
          data-testid={`chart-card-range-${r.key}`}
          className={clsx(
            'rounded px-2 py-0.5 text-xs font-medium transition',
            r.key === active
              ? 'bg-surface-3 text-text-primary'
              : 'text-text-tertiary hover:text-text-secondary',
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function ChartBody({
  kind,
  series,
  height,
  yDomain,
}: {
  kind: ChartKind;
  series: ChartSeries[];
  height: number;
  yDomain?: [number, number];
}) {
  const merged = useMemo(() => mergeSeries(series), [series]);
  const colorFor = (s: ChartSeries, i: number) =>
    s.color ?? CHART_PALETTE[i % CHART_PALETTE.length];

  const axes = (
    <>
      <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
      <XAxis
        dataKey="x"
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
      <Legend wrapperStyle={CHART_LEGEND_STYLE} />
    </>
  );

  const margin = { top: 8, right: 16, left: -8, bottom: 0 };

  return (
    <div style={{ height }} data-testid={`chart-card-body-${kind}`}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'bar' ? (
          <BarChart data={merged} margin={margin}>
            {axes}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={colorFor(s, i)}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        ) : kind === 'area' ? (
          <AreaChart data={merged} margin={margin}>
            {axes}
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={colorFor(s, i)}
                fill={colorFor(s, i)}
                fillOpacity={0.15}
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={merged} margin={margin}>
            {axes}
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={colorFor(s, i)}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartCard({
  title,
  summary,
  icon,
  series,
  kind = 'line',
  height = 240,
  yDomain,
  ranges,
  activeRange,
  onRangeChange,
  actions,
  footer,
  variant,
  osSlug,
  loading = false,
  emptyState,
  className,
}: ChartCardProps) {
  // Uncontrolled fallback so the toggle still works without a parent
  // wiring `activeRange` — useful for isolation demos / tests.
  const [internalRange, setInternalRange] = useState<string>(
    activeRange ?? ranges?.[0]?.key ?? '',
  );
  const resolvedRange = activeRange ?? internalRange;
  const handleRangeChange = (key: string) => {
    if (activeRange === undefined) setInternalRange(key);
    onRangeChange?.(key);
  };

  const hasData =
    series.length > 0 && series.some((s) => s.data.some((p) => p.y !== null));

  const headerAction =
    ranges && ranges.length > 0 ? (
      <div className="flex items-center gap-2">
        <RangeToggle
          ranges={ranges}
          active={resolvedRange}
          onChange={handleRangeChange}
        />
        {actions}
      </div>
    ) : (
      actions
    );

  let body: ReactNode;
  if (loading) {
    body = (
      <div style={{ height }}>
        <Skeleton variant="block" data-testid="chart-card-skeleton" />
      </div>
    );
  } else if (!hasData) {
    if (emptyState === false) {
      body = (
        <div
          data-testid="chart-card-empty-inline"
          className="flex items-center justify-center rounded-lg border border-dashed border-border-subtle bg-surface-0/40 text-xs text-text-secondary"
          style={{ height }}
        >
          No data in this window yet.
        </div>
      );
    } else {
      body = (
        <div style={{ minHeight: height }} className="flex items-center">
          <EmptyState
            variant="bare"
            title="No data yet"
            description="This chart will populate once there's something to plot."
            className="w-full"
            {...emptyState}
          />
        </div>
      );
    }
  } else {
    body = (
      <ChartBody
        kind={kind}
        series={series}
        height={height}
        yDomain={yDomain}
      />
    );
  }

  return (
    <DashboardWidget
      title={title}
      icon={icon}
      action={headerAction}
      footer={footer}
      variant={variant}
      osSlug={osSlug}
      className={className}
      data-testid="chart-card"
    >
      {summary ? (
        <span className="sr-only" data-testid="chart-card-summary">
          {summary}
        </span>
      ) : null}
      {body}
    </DashboardWidget>
  );
}
