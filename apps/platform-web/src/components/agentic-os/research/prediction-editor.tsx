'use client';

/**
 * Research OS Phase 3 — Prediction editor (create + edit modes).
 *
 * Kind picker, confidence picker, and a single-line text input.
 * POSTs to `/hypotheses/:id/predictions` on create; PATCHes
 * `/predictions/:predId` on edit.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState } from 'react';
import {
  PREDICTION_KINDS,
  PREDICTION_KIND_LABELS,
  type Prediction,
  type PredictionKind,
} from '@/lib/agentic-os/research/predictions';
import { CONFIDENCE_LEVELS, type ConfidenceLevel } from '@/lib/agentic-os/research/hypotheses';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

interface CreateProps {
  mode: 'create';
  hypothesisId: string;
  onCreated: (p: Prediction) => void;
  onCancel?: () => void;
}

interface EditProps {
  mode: 'edit';
  prediction: Prediction;
  onUpdated: (p: Prediction) => void;
  onCancel?: () => void;
}

type Props = CreateProps | EditProps;

export function PredictionEditor(props: Props) {
  const initial: Pick<Prediction, 'text' | 'kind' | 'confidence'> =
    props.mode === 'edit'
      ? { text: props.prediction.text, kind: props.prediction.kind, confidence: props.prediction.confidence }
      : { text: '', kind: 'positive', confidence: 'medium' };

  const [text, setText] = useState(initial.text);
  const [kind, setKind] = useState<PredictionKind>(initial.kind);
  const [confidence, setConfidence] = useState<ConfidenceLevel>(initial.confidence);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim()) {
      setError('Prediction text required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (props.mode === 'create') {
        const res = await fetch(
          `/api/tiresias/agentic-os/research/hypotheses/${props.hypothesisId}/predictions`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: text.trim(), kind, confidence }),
          },
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? `Failed (${res.status})`);
          return;
        }
        const { prediction } = await res.json();
        props.onCreated(prediction);
        setText('');
        setKind('positive');
        setConfidence('medium');
      } else {
        const res = await fetch(
          `/api/tiresias/agentic-os/research/predictions/${props.prediction.id}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: text.trim(), kind, confidence }),
          },
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? `Failed (${res.status})`);
          return;
        }
        const { prediction } = await res.json();
        props.onUpdated(prediction);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-[#2a2d3e] bg-[#0f1117]/60 p-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. The treated group will show ≥20% increase in throughput vs control."
        rows={2}
        className={inputCls}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PredictionKind)}
            className={inputCls}
          >
            {PREDICTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {PREDICTION_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1">Confidence</span>
          <select
            value={confidence}
            onChange={(e) => setConfidence(e.target.value as ConfidenceLevel)}
            className={inputCls}
          >
            {CONFIDENCE_LEVELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
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
              : 'Add prediction'}
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
