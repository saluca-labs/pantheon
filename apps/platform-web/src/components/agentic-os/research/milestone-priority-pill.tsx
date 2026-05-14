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
  medium: 'border-sky-500/40 bg-sky-500/5 text-sky-300',
  high: 'border-amber-500/50 bg-amber-500/5 text-amber-300',
  critical: 'border-red-500/60 bg-red-500/10 text-red-300',
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
