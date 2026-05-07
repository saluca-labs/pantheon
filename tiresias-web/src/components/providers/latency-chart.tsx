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

interface LatencyChartProps {
  data: LatencyResponse | undefined;
  isLoading: boolean;
}

export function LatencyChart({ data, isLoading }: LatencyChartProps) {
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
          Latency Percentiles (ms)
        </h3>
        <div className="h-64 flex items-center justify-center">
          <p className="text-[#94a3b8]">No latency data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1d27] border border-[#2a2d3e] rounded-lg p-4">
      <h3 className="text-white font-medium text-sm mb-2">
        Latency Percentiles (ms)
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid stroke="#2a2d3e" strokeDasharray="3 3" />
          <XAxis
            dataKey="provider"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: '#2a2d3e' }}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: '#2a2d3e' }}
            label={{
              value: 'ms',
              angle: -90,
              position: 'insideLeft',
              fill: '#94a3b8',
              fontSize: 12,
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1d27',
              border: '1px solid #2a2d3e',
              borderRadius: '8px',
              color: '#fff',
            }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="p50_ms"
            name="P50"
            stroke="#4361EE"
            strokeWidth={2}
            dot={{ r: 4, fill: '#4361EE' }}
          />
          <Line
            type="monotone"
            dataKey="p95_ms"
            name="P95"
            stroke="#FDCB6E"
            strokeWidth={2}
            dot={{ r: 4, fill: '#FDCB6E' }}
          />
          <Line
            type="monotone"
            dataKey="p99_ms"
            name="P99"
            stroke="#E17055"
            strokeWidth={2}
            dot={{ r: 4, fill: '#E17055' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
