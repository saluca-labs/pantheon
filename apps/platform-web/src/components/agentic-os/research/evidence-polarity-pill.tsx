/**
 * Research OS Phase 3 — Evidence polarity pill.
 *
 * Small visual chip rendered next to each evidence card and in the
 * polarity-grouped panel headers (Supports / Refutes / Mixed).
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import {
  EVIDENCE_POLARITY_LABELS,
  type EvidencePolarity,
} from '@/lib/agentic-os/research/evidence';

const POLARITY_COLOR: Record<EvidencePolarity, string> = {
  supports: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  refutes:  'text-rose-300 bg-rose-500/10 border-rose-500/30',
  mixed:    'text-amber-300 bg-amber-500/10 border-amber-500/30',
};

export function EvidencePolarityPill({ polarity }: { polarity: EvidencePolarity }) {
  return (
    <span
      className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${POLARITY_COLOR[polarity]}`}
    >
      {EVIDENCE_POLARITY_LABELS[polarity]}
    </span>
  );
}
