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
  pending: 'border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8]',
  at_risk: 'border-yellow-500/50 bg-yellow-500/5 text-yellow-300',
  blocked: 'border-red-500/50 bg-red-500/5 text-red-300',
  on_track: 'border-emerald-500/50 bg-emerald-500/5 text-emerald-300',
  done: 'border-[#4361EE]/50 bg-[#4361EE]/10 text-white',
  missed: 'border-red-600/60 bg-red-500/10 text-red-300',
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
