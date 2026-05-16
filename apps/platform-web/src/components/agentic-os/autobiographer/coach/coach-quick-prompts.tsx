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
          className="text-left text-sm text-text-primary rounded-lg border border-border-subtle bg-surface-0 hover:border-border-strong hover:bg-surface-1 transition px-3 py-2 disabled:opacity-50"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
