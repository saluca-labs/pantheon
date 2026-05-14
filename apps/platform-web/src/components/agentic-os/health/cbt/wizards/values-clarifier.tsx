'use client';

import { useState } from 'react';
import { SubmitBar, useCbtSubmit } from './_shared';

interface Props {
  exerciseId?: string;
}

interface Row {
  domain: string;
  importance: number;
  current_alignment: number;
  action: string;
}

const DEFAULT_DOMAINS = ['Family', 'Health', 'Work', 'Growth'];

export function ValuesClarifier({ exerciseId }: Props) {
  const { submit, submitting, error } = useCbtSubmit();
  const [rows, setRows] = useState<Row[]>(
    DEFAULT_DOMAINS.map((d) => ({
      domain: d,
      importance: 5,
      current_alignment: 5,
      action: '',
    })),
  );

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((curr) => curr.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((curr) => [
      ...curr,
      { domain: '', importance: 5, current_alignment: 5, action: '' },
    ]);
  }
  function removeRow(idx: number) {
    setRows((curr) =>
      curr.length === 1 ? curr : curr.filter((_, i) => i !== idx),
    );
  }

  function onSubmit() {
    void submit({
      kind: 'values-clarification',
      exerciseId: exerciseId ?? null,
      data: {
        values: rows
          .filter((r) => r.domain.trim().length > 0 && r.action.trim().length > 0)
          .map((r) => ({
            domain: r.domain.trim(),
            importance: r.importance,
            current_alignment: r.current_alignment,
            action: r.action.trim(),
          })),
      },
    });
  }

  const canSubmit = rows.some(
    (r) => r.domain.trim().length > 0 && r.action.trim().length > 0,
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary leading-relaxed">
        For each domain that matters to you, rate how important it is and
        how aligned your recent actions have been. Then pick one concrete
        action you can take this week.
      </p>
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li
            key={i}
            className="rounded-xl border border-border-subtle bg-surface-0 p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                value={r.domain}
                onChange={(e) => setRow(i, { domain: e.target.value })}
                placeholder="Domain (e.g. Family, Health, Work)"
                className="flex-1 rounded-lg border border-border-subtle bg-surface-2 text-sm text-white placeholder:text-text-secondary px-3 py-2"
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="text-xs text-text-secondary hover:text-red-300 px-2"
                >
                  remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <RatingRow
                label="Importance"
                value={r.importance}
                onChange={(v) => setRow(i, { importance: v })}
              />
              <RatingRow
                label="Current alignment"
                value={r.current_alignment}
                onChange={(v) => setRow(i, { current_alignment: v })}
              />
            </div>
            <textarea
              value={r.action}
              onChange={(e) => setRow(i, { action: e.target.value })}
              rows={2}
              placeholder="One concrete action you can take this week"
              className="w-full rounded-lg border border-border-subtle bg-surface-2 text-sm text-white placeholder:text-text-secondary px-3 py-2 leading-relaxed resize-y"
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addRow}
        className="text-xs text-accent hover:text-[#5d7aff] transition"
      >
        + Add another domain
      </button>
      <SubmitBar
        submitting={submitting}
        disabled={!canSubmit}
        error={error}
        onClick={onSubmit}
      />
    </div>
  );
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wide text-text-secondary mb-1">
        {label} ({value})
      </label>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-accent"
      />
    </div>
  );
}
