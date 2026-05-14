'use client';

/**
 * Research OS Phase 3 — Evidence panel grouped by polarity.
 *
 * Renders three sub-sections: Supports / Refutes / Mixed. Each row is
 * an `EvidenceCard`. An "Add evidence" affordance opens the polymorphic
 * `EvidenceLinkPicker` inline at the top.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState, useMemo } from 'react';
import { Plus, Scale } from 'lucide-react';
import { EvidenceCard } from './evidence-card';
import { EvidenceLinkPicker } from './evidence-link-picker';
import { EvidencePolarityPill } from './evidence-polarity-pill';
import {
  EVIDENCE_POLARITIES,
  type Evidence,
  type EvidencePolarity,
} from '@/lib/agentic-os/research/evidence';

interface Props {
  hypothesisId: string;
  initialEvidence: Evidence[];
}

export function EvidencePanel({ hypothesisId, initialEvidence }: Props) {
  const [evidence, setEvidence] = useState<Evidence[]>(initialEvidence);
  const [adding, setAdding] = useState(false);

  const grouped = useMemo(() => {
    const out: Record<EvidencePolarity, Evidence[]> = {
      supports: [],
      refutes: [],
      mixed: [],
    };
    for (const e of evidence) out[e.polarity].push(e);
    return out;
  }, [evidence]);

  function onLinked(e: Evidence) {
    setEvidence((prev) => [...prev, e]);
    setAdding(false);
  }
  function onDeleted(id: string) {
    setEvidence((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <section aria-labelledby="evidence-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2
            id="evidence-heading"
            className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
          >
            <Scale className="w-4 h-4 text-accent" />
            Evidence
          </h2>
          <p className="text-xs text-text-secondary">
            Supporting and refuting sources. Notebook entries, papers, datasets,
            external URLs, or free text.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-xs text-text-secondary hover:text-white transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add evidence
          </button>
        )}
      </div>

      {adding && (
        <EvidenceLinkPicker
          hypothesisId={hypothesisId}
          onLinked={onLinked}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="space-y-4">
        {EVIDENCE_POLARITIES.map((p) => {
          const rows = grouped[p];
          if (rows.length === 0) return null;
          return (
            <div key={p} className="space-y-2">
              <div className="flex items-center gap-2">
                <EvidencePolarityPill polarity={p} />
                <span className="text-xs text-text-secondary">
                  {rows.length} {rows.length === 1 ? 'row' : 'rows'}
                </span>
              </div>
              <div className="space-y-2">
                {rows.map((e) => (
                  <EvidenceCard key={e.id} evidence={e} onDeleted={onDeleted} />
                ))}
              </div>
            </div>
          );
        })}

        {evidence.length === 0 && !adding && (
          <p className="text-sm text-text-secondary italic">No evidence linked yet.</p>
        )}
      </div>
    </section>
  );
}
