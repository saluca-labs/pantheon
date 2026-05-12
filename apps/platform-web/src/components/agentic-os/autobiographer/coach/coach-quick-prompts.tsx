/**
 * Autobiographer coach — per-mode quick-prompt suggestion chips.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

'use client';

import {
  COACH_MODE_STARTERS,
  type CoachMode,
} from '@/lib/agentic-os/autobiographer/coach/modes';

interface Props {
  mode: CoachMode;
  onPick: (prompt: string) => void;
  disabled?: boolean;
}

export function CoachQuickPrompts({ mode, onPick, disabled }: Props) {
  const starters = COACH_MODE_STARTERS[mode];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {starters.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s)}
          className="text-left text-sm text-[#cbd5e1] rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#3b4252] hover:bg-[#161823] transition px-3 py-2 disabled:opacity-50"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
