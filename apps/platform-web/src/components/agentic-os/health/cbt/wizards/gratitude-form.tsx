'use client';

import { useState } from 'react';
import { SubmitBar, useCbtSubmit } from './_shared';

interface Props {
  exerciseId?: string;
}

export function GratitudeForm({ exerciseId }: Props) {
  const { submit, submitting, error } = useCbtSubmit();
  const [entries, setEntries] = useState<string[]>(['', '', '']);

  function setAt(idx: number, value: string) {
    setEntries((curr) => curr.map((v, i) => (i === idx ? value : v)));
  }

  function onSubmit() {
    void submit({
      kind: 'gratitude',
      exerciseId: exerciseId ?? null,
      data: { entries },
    });
  }

  const canSubmit = entries.every((e) => e.trim().length > 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary leading-relaxed">
        Three things, big or small. For each, one sentence on why it
        mattered.
      </p>
      <ul className="space-y-3">
        {entries.map((e, i) => (
          <li key={i}>
            <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
              #{i + 1}
            </label>
            <textarea
              value={e}
              onChange={(ev) => setAt(i, ev.target.value)}
              rows={2}
              placeholder="What went well, and why did it matter?"
              className="w-full rounded-lg border border-border-subtle bg-surface-0 text-sm text-white placeholder:text-text-secondary px-3 py-2 leading-relaxed resize-y"
            />
          </li>
        ))}
      </ul>
      <SubmitBar
        submitting={submitting}
        disabled={!canSubmit}
        error={error}
        onClick={onSubmit}
      />
    </div>
  );
}
