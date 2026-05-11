'use client';

/**
 * CyberSec OS — Alert volume trend chart.
 *
 * Wraps the OS-agnostic _shared/trend-chart.tsx primitive — total / critical
 * / high alert counts per day across the trend window.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { TrendChart } from '@/components/agentic-os/_shared/trend-chart';
import type { TrendsPayload } from '@/lib/agentic-os/cyber/repo';

export function AlertVolumeChart({ alertsByDay }: { alertsByDay: TrendsPayload['alertsByDay'] }) {
  return (
    <TrendChart
      series={[
        {
          key: 'total',
          label: 'Total alerts',
          data: alertsByDay.map((d) => ({ date: d.date, value: d.total })),
        },
        {
          key: 'critical',
          label: 'Critical',
          color: '#ef4444',
          data: alertsByDay.map((d) => ({ date: d.date, value: d.critical })),
        },
        {
          key: 'high',
          label: 'High',
          color: '#f59e0b',
          data: alertsByDay.map((d) => ({ date: d.date, value: d.high })),
        },
      ]}
      height={260}
      emptyLabel="No alerts in this window."
    />
  );
}
