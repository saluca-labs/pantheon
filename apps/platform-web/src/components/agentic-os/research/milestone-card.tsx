/**
 * Research OS Phase 6 — single milestone card.
 *
 * Rendered server-side as part of the milestone list / strip. Includes
 * status pill, priority pill, due date, blocker flag.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { Calendar, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { MilestoneStatusPill } from './milestone-status-pill';
import { MilestonePriorityPill } from './milestone-priority-pill';
import {
  milestoneDerivedStatus,
  type ExperimentMilestone,
} from '@/lib/agentic-os/research/milestones';

interface Props {
  milestone: ExperimentMilestone;
  today?: Date;
}

export function MilestoneCard({ milestone, today }: Props) {
  const derived = milestoneDerivedStatus(milestone, today ?? new Date());
  const overdue = derived === 'overdue';
  return (
    <div
      className={`rounded-lg border p-3 bg-[#1a1d27] ${
        overdue ? 'border-red-500/40' : 'border-[#2a2d3e]'
      }`}
      data-testid={`milestone-card-${milestone.id}`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-medium text-white flex-1 min-w-0 truncate">
          {milestone.title}
        </h4>
        <div className="flex items-center gap-1.5 flex-wrap">
          <MilestoneStatusPill status={milestone.status} />
          <MilestonePriorityPill priority={milestone.priority} />
          {milestone.isBlocker && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-red-500/60 bg-red-500/10 text-red-300"
              data-testid="milestone-blocker-flag"
            >
              <ShieldAlert className="w-3 h-3" />
              Blocker
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-[#94a3b8] flex-wrap">
        {milestone.dueAt && (
          <span
            className={`inline-flex items-center gap-1 ${overdue ? 'text-red-300' : ''}`}
          >
            <Calendar className="w-3 h-3" />
            Due {milestone.dueAt}
            {overdue && <span className="ml-1">(overdue)</span>}
          </span>
        )}
        {milestone.completedAt && (
          <span className="inline-flex items-center gap-1 text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        )}
      </div>
      {milestone.blockedReason && (
        <p className="mt-2 text-xs text-[#cbd5e1] whitespace-pre-wrap">
          {milestone.blockedReason}
        </p>
      )}
    </div>
  );
}
