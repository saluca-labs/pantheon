/**
 * Research OS Phase 6 — milestone priority pill.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import {
  MILESTONE_PRIORITY_LABELS,
  type MilestonePriority,
} from '@/lib/agentic-os/research/milestones';

const PRIORITY_STYLE: Record<MilestonePriority, string> = {
  low: 'border-border-subtle bg-surface-0 text-text-secondary',
  medium: 'border-os-research/40 bg-os-research/5 text-os-research',
  high: 'border-warning/50 bg-warning/5 text-warning',
  critical: 'border-danger/60 bg-danger/10 text-danger',
};

interface Props {
  priority: MilestonePriority;
}

export function MilestonePriorityPill({ priority }: Props) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${PRIORITY_STYLE[priority]}`}
      data-testid={`milestone-priority-pill-${priority}`}
    >
      {MILESTONE_PRIORITY_LABELS[priority]}
    </span>
  );
}
