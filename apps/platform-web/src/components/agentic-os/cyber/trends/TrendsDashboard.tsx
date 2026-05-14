'use client';

/**
 * CyberSec OS — Trends dashboard composition.
 *
 * Wave D specialization (plan §3, "trends dashboard as widget grid"). Wave
 * C-2a had already moved the alert-volume + open-vulns surfaces onto the
 * `ChartCard` primitive, but the page itself was still a vertical stack of
 * ad-hoc `<section>`s. Wave D recomposes it as a real widget grid:
 *
 *  - A remediation-rail of `DashboardWidget` tiles (MTTR / open / closed-30d)
 *    — the single-scalar exposure metrics, framed like the hub's widgets.
 *  - A two-up `ChartCard` grid: open-vulns-by-severity + alert-volume.
 *  - The IOC surface is now a focused `IocHitRateChart` (a `ChartCard`)
 *    instead of two bare `StatCard` scalars — the *rate* is the meaningful
 *    number.
 *  - Top vulnerable assets stays as its table, wrapped in a `DashboardWidget`
 *    so the whole page reads as one coherent grid.
 *
 * No API routes or queries changed — `TrendsPayload` is fetched exactly as
 * before; `buildIocHitRate` is a pure data-shape adapter over it.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { Clock, Download, Server } from 'lucide-react';
import type { TrendsPayload } from '@/lib/agentic-os/cyber/repo';
import { buildIocHitRate } from '@/lib/agentic-os/cyber/trends-spec';
import { DashboardWidget } from '@/components/agentic-os/_shared/views';
import { AlertVolumeChart } from './AlertVolumeChart';
import { OpenVulnsChart } from './OpenVulnsChart';
import { TopVulnerableAssetsTable } from './TopVulnerableAssetsTable';
import { IocHitRateChart } from './IocHitRateChart';

export function TrendsDashboard({ trends }: { trends: TrendsPayload }) {
  const hitRate = buildIocHitRate(trends);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Rolling 30-day trends across alerts, vulnerabilities, exposures, and
          IOC hits. Export the current exposure snapshot as PDF for
          stakeholders.
        </p>
        <a
          href="/api/tiresias/agentic-os/cyber/exports/exposure-report.pdf"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium px-3 py-2 text-sm transition shrink-0"
        >
          <Download className="w-4 h-4" />
          Export exposure report PDF
        </a>
      </div>

      {/* Exposure remediation rail — single-scalar metrics as widgets. */}
      <div
        data-testid="trends-remediation-rail"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <DashboardWidget
          title="Exposure MTTR"
          icon={<Clock className="h-4 w-4" />}
          osSlug="cyber"
          data-testid="trends-widget-mttr"
          footer="Average remediated_at − detected_at"
        >
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {trends.exposuresMttrDays != null
              ? `${trends.exposuresMttrDays.toFixed(1)}`
              : '—'}
            <span className="ml-1 text-sm font-normal text-text-secondary">
              days
            </span>
          </p>
        </DashboardWidget>
        <DashboardWidget
          title="Open exposures"
          osSlug="cyber"
          variant={trends.exposuresOpen > 0 ? 'warning' : 'default'}
          data-testid="trends-widget-open-exposures"
          footer="status ∈ {open, in_progress, accepted}"
        >
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {trends.exposuresOpen}
          </p>
        </DashboardWidget>
        <DashboardWidget
          title="Closed last 30d"
          osSlug="cyber"
          data-testid="trends-widget-closed-30d"
          footer="resolved + mitigated + false positive"
        >
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {trends.exposuresClosedLast30d}
          </p>
        </DashboardWidget>
      </div>

      {/* Two-up chart grid. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <OpenVulnsChart openVulnsBySeverity={trends.openVulnsBySeverity} />
        <IocHitRateChart hitRate={hitRate} />
      </div>

      <AlertVolumeChart alertsByDay={trends.alertsByDay} />

      {/* Top vulnerable assets, framed as a widget so the page reads as a grid. */}
      <DashboardWidget
        title="Top vulnerable assets"
        icon={<Server className="h-4 w-4" />}
        osSlug="cyber"
        data-testid="trends-widget-top-assets"
        action={
          <Link
            href="/dashboard/os/cyber/exposures"
            className="text-xs text-text-secondary transition hover:text-text-primary"
          >
            See all exposures →
          </Link>
        }
      >
        <TopVulnerableAssetsTable rows={trends.topVulnerableAssets} />
      </DashboardWidget>
    </div>
  );
}
