'use client';

/**
 * Research OS Phase 3 — Falsifier editor (create + edit modes).
 *
 * Headline text + optional `criterion_md` (quantitative gate, markdown).
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState } from 'react';
import type { Falsifier } from '@/lib/agentic-os/research/falsifiers';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

interface CreateProps {
  mode: 'create';
  hypothesisId: string;
  onCreated: (f: Falsifier) => void;
  onCancel?: () => void;
}

interface EditProps {
  mode: 'edit';
  falsifier: Falsifier;
  onUpdated: (f: Falsifier) => void;
  onCancel?: () => void;
}

type Props = CreateProps | EditProps;

export function FalsifierEditor(props: Props) {
  const initial: Pick<Falsifier, 'text' | 'criterionMd'> =
    props.mode === 'edit'
      ? { text: props.falsifier.text, criterionMd: props.falsifier.criterionMd }
      : { text: '', criterionMd: '' };

  const [text, setText] = useState(initial.text);
  const [criterionMd, setCriterionMd] = useState(initial.criterionMd ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim()) {
      setError('Falsifier text required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        text: text.trim(),
        criterionMd: criterionMd.trim() || null,
      };
      if (props.mode === 'create') {
        const res = await fetch(
          `/api/tiresias/agentic-os/research/hypotheses/${props.hypothesisId}/falsifiers`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? `Failed (${res.status})`);
          return;
        }
        const { falsifier } = await res.json();
        props.onCreated(falsifier);
        setText('');
        setCriterionMd('');
      } else {
        const res = await fetch(
          `/api/tiresias/agentic-os/research/falsifiers/${props.falsifier.id}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? `Failed (${res.status})`);
          return;
        }
        const { falsifier } = await res.json();
        props.onUpdated(falsifier);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-[#2a2d3e] bg-[#0f1117]/60 p-4">
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1">Falsifier</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. If we observe <5% effect across 3 runs, we should reject."
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1">
          Criterion (optional, markdown)
        </span>
        <textarea
          value={criterionMd}
          onChange={(e) => setCriterionMd(e.target.value)}
          placeholder="e.g. Two-sample t-test p > 0.05 OR mean effect < 0.05 SD."
          rows={2}
          className={inputCls}
        />
      </label>
      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !text.trim()}
          className="rounded-md bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-50 px-3 py-1.5 text-sm text-white transition"
        >
          {saving
            ? props.mode === 'edit'
              ? 'Saving…'
              : 'Adding…'
            : props.mode === 'edit'
              ? 'Save'
              : 'Add falsifier'}
        </button>
        {props.onCancel && (
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-1.5 text-sm text-[#94a3b8] hover:text-white transition"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
