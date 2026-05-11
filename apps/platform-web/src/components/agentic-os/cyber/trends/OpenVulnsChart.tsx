'use client';

/**
 * CyberSec OS — Open vulnerabilities by severity, stat-card stack.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { StatCard } from '@/components/agentic-os/_shared/stat-card';
import { Bug } from 'lucide-react';
import {
  VULNERABILITY_SEVERITIES,
  type VulnerabilitySeverity,
} from '@/lib/agentic-os/cyber/vulnerabilities';
import type { TrendsPayload } from '@/lib/agentic-os/cyber/repo';

export function OpenVulnsChart({ openVulnsBySeverity }: { openVulnsBySeverity: TrendsPayload['openVulnsBySeverity'] }) {
  const lookup = new Map<string, number>(
    openVulnsBySeverity.map((r) => [r.severity, r.count]),
  );
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {VULNERABILITY_SEVERITIES.map((s) => (
        <StatCard
          key={s.value}
          label={s.label}
          value={lookup.get(s.value) ?? 0}
          icon={<Bug className="w-4 h-4" />}
        />
      ))}
    </div>
  );
}
