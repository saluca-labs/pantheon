'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ErrorRatesResponse } from '@/lib/api/schemas/errors';
import {
  ACCENT,
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  CHART_LEGEND_STYLE,
  DANGER,
} from '@/lib/design/chart-tokens';

interface ErrorRateChartProps {
  data: ErrorRatesResponse | undefined;
  isLoading: boolean;
}

interface TooltipPayloadItem {
  value: number;
  dataKey: string;
  payload: {
    provider: string;
    error_count: number;
    total_requests: number;
    error_rate: number;
  };
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const entry = payload[0]?.payload;

  return (
    <div className="bg-surface-2 border border-border-subtle rounded-lg p-3 text-sm">
      <p className="text-white font-medium mb-1">{label}</p>
      <p className="text-danger">Errors: {entry?.error_count ?? 0}</p>
      <p className="text-accent">
        Total Requests: {entry?.total_requests ?? 0}
      </p>
      <p className="text-text-secondary">
        Error Rate: {((entry?.error_rate ?? 0) * 100).toFixed(2)}%
      </p>
    </div>
  );
}

export function ErrorRateChart({ data, isLoading }: ErrorRateChartProps) {
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
          Error Rates by Provider
        </h3>
        <div className="h-64 flex items-center justify-center">
          <p className="text-text-secondary">No error data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-2 border border-border-subtle rounded-lg p-4">
      <h3 className="text-white font-medium text-sm mb-2">
        Error Rates by Provider
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
          <XAxis
            dataKey="provider"
            tick={{ fill: CHART_AXIS_STROKE, fontSize: 12 }}
            axisLine={{ stroke: CHART_GRID_STROKE }}
          />
          <YAxis
            tick={{ fill: CHART_AXIS_STROKE, fontSize: 12 }}
            axisLine={{ stroke: CHART_GRID_STROKE }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={CHART_LEGEND_STYLE} />
          <Bar
            dataKey="total_requests"
            name="Total Requests"
            fill={ACCENT}
            opacity={0.4}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="error_count"
            name="Errors"
            fill={DANGER}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
