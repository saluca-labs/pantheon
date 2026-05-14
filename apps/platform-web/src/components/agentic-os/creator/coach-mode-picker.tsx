/**
 * Creator coach — mode picker.
 *
 * Wave D-4b (UI Depth Wave) — mode-picker depth:
 *   The bare 5-chip group is now a richer picker. Two layouts:
 *     - `variant="chips"` (default, back-compat): the flat chip row, but
 *       re-tinted off raw `fuchsia-*` / hex onto the `os-creator` accent.
 *     - `variant="cards"`: a 2-up grid of selectable cards, each showing the
 *       mode label + its one-line description, with the `os-creator` accent
 *       on the active card. Used by the coach hub so the mode's purpose is
 *       visible at the point of choice instead of one line below the row.
 *   Selection state + the `CoachMode` contract are unchanged.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

'use client';

import { Check } from 'lucide-react';
import {
  COACH_MODE_DESCRIPTIONS,
  COACH_MODE_LABELS,
  COACH_MODE_VALUES,
  type CoachMode,
} from '@/lib/agentic-os/creator/coach/modes';

interface Props {
  value: CoachMode;
  onChange: (mode: CoachMode) => void;
  disabled?: boolean;
  /** `chips` = flat row (default), `cards` = grid with descriptions. */
  variant?: 'chips' | 'cards';
}

export function CoachModePicker({
  value,
  onChange,
  disabled,
  variant = 'chips',
}: Props) {
  if (variant === 'cards') {
    return (
      <div
        data-testid="coach-mode-picker"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      >
        {COACH_MODE_VALUES.map((m) => {
          const active = m === value;
          return (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => onChange(m)}
              aria-pressed={active}
              className={`group flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                active
                  ? 'border-os-creator/60 bg-os-creator/10'
                  : 'border-border-subtle bg-surface-0 hover:border-border-strong'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={`text-sm font-medium ${
                    active ? 'text-white' : 'text-text-primary'
                  }`}
                >
                  {COACH_MODE_LABELS[m]}
                </span>
                {active && (
                  <Check className="h-3.5 w-3.5 flex-shrink-0 text-os-creator" />
                )}
              </span>
              <span className="text-xs leading-snug text-text-secondary">
                {COACH_MODE_DESCRIPTIONS[m]}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div data-testid="coach-mode-picker" className="flex flex-wrap gap-2">
      {COACH_MODE_VALUES.map((m) => {
        const active = m === value;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            aria-pressed={active}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition disabled:opacity-50 ${
              active
                ? 'bg-os-creator text-white border-os-creator'
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
