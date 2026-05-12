/**
 * Research OS Phase 6 — reproducibility state pill.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import {
  REPRO_STATE_LABELS,
  type ReproState,
} from '@/lib/agentic-os/research/reproducibility';

const STATE_STYLE: Record<ReproState, string> = {
  pending: 'border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8]',
  in_progress: 'border-sky-500/50 bg-sky-500/5 text-sky-300',
  done: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
  not_applicable: 'border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8] opacity-60',
  waived: 'border-amber-500/50 bg-amber-500/5 text-amber-300',
};

interface Props {
  state: ReproState;
}

export function ReproducibilityStatePill({ state }: Props) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${STATE_STYLE[state]}`}
      data-testid={`repro-state-pill-${state}`}
    >
      {REPRO_STATE_LABELS[state]}
    </span>
  );
}
