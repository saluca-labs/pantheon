'use client';

/**
 * CyberSec OS — IOC hit-rate visualization.
 *
 * Wave D specialization (plan §3, "IOC hit-rate visualization"). Trends used
 * to surface IOC hits as two bare `StatCard` scalars ("Last 7 days" / "Last 30
 * days"). This reframes them as a focused viz: a `ChartCard` bar chart of the
 * IOC hit *rate* — IOC-matching alerts as a percentage of all alerts — across
 * the 7d and 30d windows, with the raw hit counts in the footer.
 *
 * The rate is the analyst-meaningful number: "8 hits" means nothing without
 * the denominator; "12% of alert volume matched a known indicator" does. Data
 * comes from `buildIocHitRate`, a pure adapter over the existing
 * `TrendsPayload` — no new queries.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { Crosshair } from 'lucide-react';
import { ChartCard } from '@/components/agentic-os/_shared/views';
import type { IocHitRatePoint } from '@/lib/agentic-os/cyber/trends-spec';

export function IocHitRateChart({
  hitRate,
}: {
  hitRate: IocHitRatePoint[];
}) {
  const by = (w: '7d' | '30d') => hitRate.find((p) => p.window === w);
  const p7 = by('7d');
  const p30 = by('30d');

  return (
    <ChartCard
      title="IOC hit rate"
      icon={<Crosshair className="h-4 w-4" />}
      osSlug="cyber"
      kind="bar"
      height={200}
      yDomain={[0, 100]}
      series={[
        {
          key: 'hitRatePct',
          label: 'IOC-matched alerts (% of volume)',
          data: hitRate.map((p) => ({ x: p.window, y: p.hitRatePct })),
        },
      ]}
      footer={
        <span data-testid="ioc-hit-rate-footer">
          {p7 ? `${p7.hits} / ${p7.totalAlerts} alerts matched an IOC in 7d` : '—'}
          {' · '}
          {p30
            ? `${p30.hits} / ${p30.totalAlerts} in 30d`
            : '—'}
        </span>
      }
      emptyState={{
        title: 'No IOC hits to rate yet',
        description:
          'Once alerts start matching catalogued indicators, the share of IOC-explained alert volume charts here.',
      }}
    />
  );
}
