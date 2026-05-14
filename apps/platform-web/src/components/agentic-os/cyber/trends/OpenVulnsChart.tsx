'use client';

/**
 * CyberSec OS — Open vulnerabilities by severity.
 *
 * Wave C-2a: now a `ChartCard` bar chart instead of a `StatCard` stack —
 * "open vulns by severity" is genuinely a distribution, and the bar form
 * reads it at a glance. Same data, same severity taxonomy.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { Bug } from 'lucide-react';
import { ChartCard } from '@/components/agentic-os/_shared/views';
import {
  VULNERABILITY_SEVERITIES,
} from '@/lib/agentic-os/cyber/vulnerabilities';
import type { TrendsPayload } from '@/lib/agentic-os/cyber/repo';

export function OpenVulnsChart({
  openVulnsBySeverity,
}: {
  openVulnsBySeverity: TrendsPayload['openVulnsBySeverity'];
}) {
  const lookup = new Map<string, number>(
    openVulnsBySeverity.map((r) => [r.severity, r.count]),
  );

  return (
    <ChartCard
      title="Open vulnerabilities by severity"
      icon={<Bug className="h-4 w-4" />}
      osSlug="cyber"
      kind="bar"
      height={220}
      series={[
        {
          key: 'count',
          label: 'Open vulnerabilities',
          data: VULNERABILITY_SEVERITIES.map((s) => ({
            x: s.label,
            y: lookup.get(s.value) ?? 0,
          })),
        },
      ]}
      emptyState={{
        title: 'No open vulnerabilities',
        description:
          'Severity distribution will chart here once exposures are tracked against vulnerabilities.',
      }}
    />
  );
}
