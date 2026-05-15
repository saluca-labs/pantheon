/**
 * Research OS Phase 6 — milestone status pill.
 *
 * Color-coded pill rendering the stored Phase 6 status taxonomy.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import {
  MILESTONE_STATUS_LABELS,
  type MilestoneStatus,
} from '@/lib/agentic-os/research/milestones';

const STATUS_STYLE: Record<MilestoneStatus, string> = {
  pending: 'border-border-subtle bg-surface-0 text-text-secondary',
  at_risk: 'border-warning/50 bg-warning/5 text-warning',
  blocked: 'border-danger/50 bg-danger/5 text-danger',
  on_track: 'border-positive/50 bg-positive/5 text-positive',
  done: 'border-accent/50 bg-accent/10 text-white',
  missed: 'border-danger/60 bg-danger/10 text-danger',
};

interface Props {
  status: MilestoneStatus;
}

export function MilestoneStatusPill({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[status]}`}
      data-testid={`milestone-status-pill-${status}`}
    >
      {MILESTONE_STATUS_LABELS[status]}
    </span>
  );
}
