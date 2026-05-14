'use client';

/**
 * Research OS Phase 3 — Predictions section for the hypothesis detail page.
 *
 * Renders the list of predictions for one hypothesis with an "Add"
 * affordance that opens an inline editor. Local state is updated in
 * place; the page never refetches.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { PredictionCard } from './prediction-card';
import { PredictionEditor } from './prediction-editor';
import type { Prediction } from '@/lib/agentic-os/research/predictions';

interface Props {
  hypothesisId: string;
  initialPredictions: Prediction[];
}

export function PredictionList({ hypothesisId, initialPredictions }: Props) {
  const [predictions, setPredictions] = useState<Prediction[]>(initialPredictions);
  const [adding, setAdding] = useState(false);

  function onCreated(p: Prediction) {
    setPredictions((prev) => [...prev, p]);
    setAdding(false);
  }

  function onUpdated(p: Prediction) {
    setPredictions((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  }

  function onDeleted(id: string) {
    setPredictions((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <section aria-labelledby="predictions-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2
            id="predictions-heading"
            className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-accent" />
            Predictions
          </h2>
          <p className="text-xs text-text-secondary">
            What you expect to observe if the hypothesis holds.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-xs text-text-secondary hover:text-white transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add prediction
          </button>
        )}
      </div>

      {adding && (
        <PredictionEditor
          mode="create"
          hypothesisId={hypothesisId}
          onCreated={onCreated}
          onCancel={() => setAdding(false)}
        />
      )}

      {predictions.length === 0 && !adding ? (
        <p className="text-sm text-text-secondary italic">No predictions yet.</p>
      ) : (
        <div className="space-y-2">
          {predictions.map((p) => (
            <PredictionCard
              key={p.id}
              prediction={p}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      )}
    </section>
  );
}
