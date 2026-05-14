'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { LatencyResponse } from '@/lib/api/schemas/latency';
import {
  ACCENT,
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  CHART_LEGEND_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  DANGER,
  WARNING,
} from '@/lib/design/chart-tokens';

interface LatencyChartProps {
  data: LatencyResponse | undefined;
  isLoading: boolean;
}

export function LatencyChart({ data, isLoading }: LatencyChartProps) {
  if (isLoading) {
    return (
      <div className="bg-surface-2 border border-border-subtle rounded-lg p-4">
        <div className="h-64 animate-pulse bg-border-subtle rounded-lg" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-surface-2 border border-border-subtle rounded-lg p-4">
        <h3 className="text-white font-medium text-sm mb-2">
          Latency Percentiles (ms)
        </h3>
        <div className="h-64 flex items-center justify-center">
          <p className="text-text-secondary">No latency data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-2 border border-border-subtle rounded-lg p-4">
      <h3 className="text-white font-medium text-sm mb-2">
        Latency Percentiles (ms)
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
          <XAxis
            dataKey="provider"
            tick={{ fill: CHART_AXIS_STROKE, fontSize: 12 }}
            axisLine={{ stroke: CHART_GRID_STROKE }}
          />
          <YAxis
            tick={{ fill: CHART_AXIS_STROKE, fontSize: 12 }}
            axisLine={{ stroke: CHART_GRID_STROKE }}
            label={{
              value: 'ms',
              angle: -90,
              position: 'insideLeft',
              fill: CHART_AXIS_STROKE,
              fontSize: 12,
            }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
          />
          <Legend wrapperStyle={CHART_LEGEND_STYLE} />
          <Line
            type="monotone"
            dataKey="p50_ms"
            name="P50"
            stroke={ACCENT}
            strokeWidth={2}
            dot={{ r: 4, fill: ACCENT }}
          />
          <Line
            type="monotone"
            dataKey="p95_ms"
            name="P95"
            stroke={WARNING}
            strokeWidth={2}
            dot={{ r: 4, fill: WARNING }}
          />
          <Line
            type="monotone"
            dataKey="p99_ms"
            name="P99"
            stroke={DANGER}
            strokeWidth={2}
            dot={{ r: 4, fill: DANGER }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
