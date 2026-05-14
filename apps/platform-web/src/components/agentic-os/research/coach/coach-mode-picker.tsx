/**
 * Research coach — 4-mode picker chip group.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

'use client';

import {
  COACH_MODE_LABELS,
  COACH_MODE_VALUES,
  type CoachMode,
} from '@/lib/agentic-os/research/coach/modes';

interface Props {
  value: CoachMode;
  onChange: (mode: CoachMode) => void;
  disabled?: boolean;
}

export function CoachModePicker({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {COACH_MODE_VALUES.map((m) => {
        const active = m === value;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition disabled:opacity-50 ${
              active
                ? 'bg-accent text-white border-accent'
                : 'bg-surface-0 text-text-primary border-border-subtle hover:border-[#3b4252] hover:text-white'
            }`}
          >
            {COACH_MODE_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}
