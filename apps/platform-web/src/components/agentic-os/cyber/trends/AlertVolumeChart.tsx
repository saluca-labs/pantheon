'use client';

/**
 * CyberSec OS — Alert volume trend chart.
 *
 * Wave C-2a: now composes the Wave B `ChartCard` primitive (title rail +
 * download action + tokenized colors + first-class empty state) instead of
 * a bare `_shared/trend-chart.tsx` inside an ad-hoc card. Same data: total /
 * critical / high alert counts per day across the trend window.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { Activity, Download } from 'lucide-react';
import { ChartCard } from '@/components/agentic-os/_shared/views';
import type { TrendsPayload } from '@/lib/agentic-os/cyber/repo';

export function AlertVolumeChart({
  alertsByDay,
}: {
  alertsByDay: TrendsPayload['alertsByDay'];
}) {
  return (
    <ChartCard
      title="Alert volume (30d)"
      icon={<Activity className="h-4 w-4" />}
      osSlug="cyber"
      kind="line"
      height={260}
      series={[
        {
          key: 'total',
          label: 'Total alerts',
          data: alertsByDay.map((d) => ({ x: d.date, y: d.total })),
        },
        {
          key: 'critical',
          label: 'Critical',
          color: '#ef4444',
          data: alertsByDay.map((d) => ({ x: d.date, y: d.critical })),
        },
        {
          key: 'high',
          label: 'High',
          color: '#f59e0b',
          data: alertsByDay.map((d) => ({ x: d.date, y: d.high })),
        },
      ]}
      actions={
        <a
          href="/api/tiresias/agentic-os/cyber/exports/exposure-report.pdf"
          className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-1 px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
        >
          <Download className="h-3.5 w-3.5" />
          Export PDF
        </a>
      }
      emptyState={{
        title: 'No alerts in this window',
        description:
          'Alert volume will chart here once your log sources start feeding the pipeline.',
      }}
    />
  );
}
