'use client';

/**
 * Generic checklist UI shared across Agentic OS surfaces.
 *
 * Health OS uses it for the Sleep Hygiene wizard (Phase 3); other OSes
 * can use it for any "tick the boxes that apply" form (e.g. Maker OS
 * tooling checklists, Cyber OS detection-coverage gaps). Renders a list
 * of items with checkboxes plus an optional notes field.
 *
 * Lives in `_shared/` because the shape is generic — items in, item-id
 * → met-state out — and is needed in more than one OS.
 */

import { useState } from 'react';

export interface ChecklistItem {
  /** Stable identifier for the item — `met` map keys on this. */
  id: string;
  /** Display label. */
  label: string;
  /** Optional helper text rendered below the label. */
  hint?: string;
  /** Initial checked state. */
  defaultMet?: boolean;
}

export interface ChecklistProps {
  items: ChecklistItem[];
  /** Optional title rendered above the list. */
  title?: string;
  /** Whether the form should include a free-text notes box. Default false. */
  withNotes?: boolean;
  /** Called whenever any item or the notes field changes. */
  onChange?: (state: ChecklistState) => void;
  /** Initial notes value (when `withNotes`). */
  defaultNotes?: string;
}

export interface ChecklistState {
  /** id → met. Includes all items, even untouched ones (default = false). */
  met: Record<string, boolean>;
  /** Final array form, useful for direct serialization to the DB shape. */
  array: { item: string; met: boolean }[];
  /** Notes string when `withNotes`; empty string otherwise. */
  notes: string;
}

export function Checklist({
  items,
  title,
  withNotes = false,
  onChange,
  defaultNotes = '',
}: ChecklistProps) {
  const initial: Record<string, boolean> = {};
  for (const it of items) initial[it.id] = !!it.defaultMet;

  const [met, setMet] = useState<Record<string, boolean>>(initial);
  const [notes, setNotes] = useState<string>(defaultNotes);

  function emit(next: Record<string, boolean>, nextNotes: string): void {
    if (!onChange) return;
    onChange({
      met: next,
      array: items.map((i) => ({ item: i.label, met: !!next[i.id] })),
      notes: nextNotes,
    });
  }

  function toggle(id: string): void {
    const next = { ...met, [id]: !met[id] };
    setMet(next);
    emit(next, notes);
  }

  function setNotesValue(v: string): void {
    setNotes(v);
    emit(met, v);
  }

  return (
    <div className="space-y-3">
      {title && (
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex items-start gap-2 rounded-lg border border-border-subtle bg-surface-0 hover:border-accent/40 px-3 py-2 cursor-pointer transition">
              <input
                type="checkbox"
                checked={!!met[item.id]}
                onChange={() => toggle(item.id)}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <span className="flex-1">
                <span className="block text-sm text-white">{item.label}</span>
                {item.hint && (
                  <span className="block text-xs text-text-secondary mt-0.5">
                    {item.hint}
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {withNotes && (
        <div>
          <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotesValue(e.target.value)}
            rows={3}
            placeholder="Anything to add"
            className="w-full rounded-lg border border-border-subtle bg-surface-0 text-sm text-white placeholder:text-text-secondary px-3 py-2 leading-relaxed resize-y"
          />
        </div>
      )}
    </div>
  );
}
