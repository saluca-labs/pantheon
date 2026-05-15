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
  pending: 'border-border-subtle bg-surface-0 text-text-secondary',
  in_progress: 'border-os-research/50 bg-os-research/5 text-os-research',
  done: 'border-positive/50 bg-positive/10 text-positive',
  not_applicable: 'border-border-subtle bg-surface-0 text-text-secondary opacity-60',
  waived: 'border-warning/50 bg-warning/5 text-warning',
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
