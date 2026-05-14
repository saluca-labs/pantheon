'use client';

/**
 * Research OS Phase 3 — Experiment-side Hypotheses tab body.
 *
 * Renders the list of linked hypotheses with role pill + remove
 * affordance, and an "Add hypothesis" picker that opens the
 * workshop-global linker.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { ExperimentHypothesisLinker } from './experiment-hypothesis-linker';
import { LinkedHypothesisRow } from './linked-hypothesis-row';
import type { LinkedHypothesis } from '@/lib/agentic-os/research/experiment-hypotheses';
import type { Hypothesis } from '@/lib/agentic-os/research/hypotheses';

interface Props {
  experimentId: string;
  initialLinked: LinkedHypothesis[];
  /** All workshop hypotheses (active, not archived) for the picker. */
  candidates: Hypothesis[];
}

export function ExperimentHypothesesTab({ experimentId, initialLinked, candidates }: Props) {
  const [linked, setLinked] = useState<LinkedHypothesis[]>(initialLinked);
  const [adding, setAdding] = useState(false);

  // Filter the candidate list to hide hypotheses ALREADY linked with the
  // default 'tests' role — the user can still pick them again with a
  // different role from the picker, but it reduces clutter for the
  // common case.
  const candidatesForPicker = useMemo(() => {
    const linkedIds = new Set(
      linked.filter((l) => l.link.role === 'tests').map((l) => l.hypothesis.id),
    );
    return candidates.filter((h) => !linkedIds.has(h.id));
  }, [candidates, linked]);

  function onLinked(l: LinkedHypothesis) {
    setLinked((prev) => [...prev, l]);
    setAdding(false);
  }

  function onUnlinked(hypothesisId: string) {
    setLinked((prev) => prev.filter((l) => l.hypothesis.id !== hypothesisId));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-text-secondary">
          Hypotheses are workshop-global. The same hypothesis can be linked across
          experiments with different roles.
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-xs text-text-secondary hover:text-white transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add hypothesis
          </button>
        )}
      </div>

      {adding && (
        <ExperimentHypothesisLinker
          experimentId={experimentId}
          candidates={candidatesForPicker}
          onLinked={onLinked}
          onCancel={() => setAdding(false)}
        />
      )}

      {linked.length === 0 && !adding ? (
        <p className="text-sm text-text-secondary italic">No hypotheses linked yet.</p>
      ) : (
        <div className="space-y-2">
          {linked.map((l) => (
            <LinkedHypothesisRow
              key={l.link.id}
              experimentId={experimentId}
              linked={l}
              onUnlinked={onUnlinked}
            />
          ))}
        </div>
      )}
    </div>
  );
}
