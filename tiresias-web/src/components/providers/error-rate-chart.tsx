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
    <div className="bg-[#1a1d27] border border-[#2a2d3e] rounded-lg p-3 text-sm">
      <p className="text-white font-medium mb-1">{label}</p>
      <p className="text-[#E17055]">Errors: {entry?.error_count ?? 0}</p>
      <p className="text-[#4361EE]">
        Total Requests: {entry?.total_requests ?? 0}
      </p>
      <p className="text-[#94a3b8]">
        Error Rate: {((entry?.error_rate ?? 0) * 100).toFixed(2)}%
      </p>
    </div>
  );
}

export function ErrorRateChart({ data, isLoading }: ErrorRateChartProps) {
  if (isLoading) {
    return (
      <div className="bg-[#1a1d27] border border-[#2a2d3e] rounded-lg p-4">
        <div className="h-64 animate-pulse bg-[#2a2d3e] rounded-lg" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-[#1a1d27] border border-[#2a2d3e] rounded-lg p-4">
        <h3 className="text-white font-medium text-sm mb-2">
          Error Rates by Provider
        </h3>
        <div className="h-64 flex items-center justify-center">
          <p className="text-[#94a3b8]">No error data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1d27] border border-[#2a2d3e] rounded-lg p-4">
      <h3 className="text-white font-medium text-sm mb-2">
        Error Rates by Provider
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid stroke="#2a2d3e" strokeDasharray="3 3" />
          <XAxis
            dataKey="provider"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: '#2a2d3e' }}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: '#2a2d3e' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
          <Bar
            dataKey="total_requests"
            name="Total Requests"
            fill="#4361EE"
            opacity={0.4}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="error_count"
            name="Errors"
            fill="#E17055"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
