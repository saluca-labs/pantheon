/**
 * CyberSec OS — MTTR stat card.
 *
 * Wraps the OS-agnostic _shared/stat-card primitive with cyber-flavoured
 * trend semantics (down is good — MTTR shrinking is the goal).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { StatCard } from '@/components/agentic-os/_shared/stat-card';
import { Clock } from 'lucide-react';

export function MttrStatCard({
  mttrDays,
  open,
  closed30d,
}: {
  mttrDays: number | null;
  open: number;
  closed30d: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <StatCard
        label="Exposure MTTR (days)"
        value={mttrDays != null ? mttrDays.toFixed(1) : null}
        sublabel="Average remediated_at − detected_at"
        icon={<Clock className="w-4 h-4" />}
        trendDownIsGood
      />
      <StatCard
        label="Open exposures"
        value={open}
        sublabel="status ∈ {open, in_progress, accepted}"
        trendDownIsGood
      />
      <StatCard
        label="Closed last 30d"
        value={closed30d}
        sublabel="resolved + mitigated + false positive"
      />
    </div>
  );
}
