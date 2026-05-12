'use client';

/**
 * Research OS Phase 3 — Single prediction card with inline edit + delete.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { PredictionEditor } from './prediction-editor';
import {
  PREDICTION_KIND_LABELS,
  type Prediction,
} from '@/lib/agentic-os/research/predictions';

const KIND_COLOR: Record<string, string> = {
  positive:  'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  negative:  'text-rose-300 bg-rose-500/10 border-rose-500/30',
  magnitude: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  direction: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
};

const CONFIDENCE_COLOR: Record<string, string> = {
  low:    'text-[#94a3b8] bg-[#0f1117] border-[#2a2d3e]',
  medium: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  high:   'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
};

interface Props {
  prediction: Prediction;
  onUpdated: (p: Prediction) => void;
  onDeleted: (id: string) => void;
}

export function PredictionCard({ prediction, onUpdated, onDeleted }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/research/predictions/${prediction.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Failed (${res.status})`);
        return;
      }
      onDeleted(prediction.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <PredictionEditor
        mode="edit"
        prediction={prediction}
        onUpdated={(p) => {
          onUpdated(p);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-lg border border-[#2a2d3e] bg-[#0f1117]/60 p-4 space-y-2">
      <p className="text-sm text-white leading-relaxed">{prediction.text}</p>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${KIND_COLOR[prediction.kind] ?? KIND_COLOR.positive}`}
          >
            {PREDICTION_KIND_LABELS[prediction.kind] ?? prediction.kind}
          </span>
          <span
            className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${CONFIDENCE_COLOR[prediction.confidence] ?? CONFIDENCE_COLOR.medium}`}
          >
            {prediction.confidence}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs text-[#94a3b8] hover:text-white transition"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
          {confirmingDelete ? (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-[#94a3b8]">Delete?</span>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="text-red-300 hover:text-red-200 disabled:opacity-50"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-[#94a3b8] hover:text-white"
              >
                No
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-1 text-xs text-[#94a3b8] hover:text-red-300 transition"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
