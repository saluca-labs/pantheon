'use client';

import {
  COACH_MODE_LABELS,
  COACH_MODE_VALUES,
  type CoachMode,
} from '@/lib/agentic-os/cyber/coach/modes';

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
                ? 'bg-danger text-white border-danger'
                : 'bg-surface-0 text-text-primary border-border-subtle hover:border-border-strong hover:text-white'
            }`}
          >
            {COACH_MODE_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}
