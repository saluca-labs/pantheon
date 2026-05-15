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
  positive:  'text-positive bg-positive/10 border-positive/30',
  negative:  'text-danger bg-danger/10 border-danger/30',
  magnitude: 'text-warning bg-warning/10 border-warning/30',
  direction: 'text-accent bg-accent/10 border-accent/30',
};

const CONFIDENCE_COLOR: Record<string, string> = {
  low:    'text-text-secondary bg-surface-0 border-border-subtle',
  medium: 'text-warning bg-warning/10 border-warning/30',
  high:   'text-positive bg-positive/10 border-positive/30',
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
    <div className="rounded-lg border border-border-subtle bg-surface-0/60 p-4 space-y-2">
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
            className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-white transition"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
          {confirmingDelete ? (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-text-secondary">Delete?</span>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="text-danger hover:text-danger/80 disabled:opacity-50"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-text-secondary hover:text-white"
              >
                No
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-danger transition"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
