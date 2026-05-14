'use client';

/**
 * CyberSec OS — Trends dashboard composition.
 *
 * Wave C-2a: the alert-volume and open-vulns surfaces are now self-framing
 * `ChartCard` primitives (see their components), so the ad-hoc section
 * headers + card wrappers around them are gone. MTTR + IOC-hit stats stay
 * as `StatCard`s — they are single scalars, not distributions.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { Download } from 'lucide-react';
import type { TrendsPayload } from '@/lib/agentic-os/cyber/repo';
import { StatCard } from '@/components/agentic-os/_shared/stat-card';
import { AlertVolumeChart } from './AlertVolumeChart';
import { OpenVulnsChart } from './OpenVulnsChart';
import { TopVulnerableAssetsTable } from './TopVulnerableAssetsTable';
import { MttrStatCard } from './MttrStatCard';

export function TrendsDashboard({ trends }: { trends: TrendsPayload }) {
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
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium px-3 py-2 text-sm transition"
        >
          <Download className="w-4 h-4" />
          Export exposure report PDF
        </a>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-white mb-3">Exposure remediation</h2>
        <MttrStatCard
          mttrDays={trends.exposuresMttrDays}
          open={trends.exposuresOpen}
          closed30d={trends.exposuresClosedLast30d}
        />
      </section>

      <OpenVulnsChart openVulnsBySeverity={trends.openVulnsBySeverity} />

      <AlertVolumeChart alertsByDay={trends.alertsByDay} />

      <section>
        <h2 className="text-sm font-semibold text-white mb-3">IOC hits</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatCard label="Last 7 days" value={trends.iocHitsLast7d} sublabel="Alerts matching an active IOC" />
          <StatCard label="Last 30 days" value={trends.iocHitsLast30d} sublabel="Alerts matching an active IOC" />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-white mb-3">Top vulnerable assets</h2>
        <TopVulnerableAssetsTable rows={trends.topVulnerableAssets} />
        <p className="mt-2 text-xs text-text-secondary">
          <Link href="/dashboard/os/cyber/exposures" className="hover:text-white">
            See all exposures →
          </Link>
        </p>
      </section>
    </div>
  );
}
