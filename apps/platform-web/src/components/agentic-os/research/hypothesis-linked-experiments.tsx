'use client';

/**
 * Research OS Phase 3 — Linked experiments section for the hypothesis
 * detail page. Read-only listing — the experiment side is where new
 * links are added (the workshop pattern: the experiment hub picks
 * hypotheses from the global ledger).
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { LinkedHypothesisRow } from './linked-hypothesis-row';
import type { LinkedHypothesis } from '@/lib/agentic-os/research/experiment-hypotheses';

interface LinkedExperimentRow {
  /** The link row + the experiment-side metadata the hypothesis page needs. */
  experimentId: string;
  experimentName: string;
  link: LinkedHypothesis['link'];
  hypothesis: LinkedHypothesis['hypothesis'];
}

interface Props {
  rows: LinkedExperimentRow[];
}

export function HypothesisLinkedExperiments({ rows: initialRows }: Props) {
  const [rows, setRows] = useState(initialRows);

  function onUnlinked(experimentId: string, hypothesisId: string) {
    setRows((prev) =>
      prev.filter((r) => !(r.experimentId === experimentId && r.hypothesis.id === hypothesisId)),
    );
  }

  if (rows.length === 0) {
    return (
      <section aria-labelledby="linked-experiments-heading" className="space-y-3">
        <h2
          id="linked-experiments-heading"
          className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
        >
          <FlaskConical className="w-4 h-4 text-[#4361EE]" />
          Linked experiments
        </h2>
        <p className="text-sm text-[#94a3b8] italic">
          Not yet linked to any experiment. Open an experiment and use the
          Hypotheses tab there to add a link.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="linked-experiments-heading" className="space-y-3">
      <h2
        id="linked-experiments-heading"
        className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2"
      >
        <FlaskConical className="w-4 h-4 text-[#4361EE]" />
        Linked experiments
      </h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <LinkedHypothesisRow
            key={`${r.experimentId}-${r.link.id}`}
            experimentId={r.experimentId}
            linked={{ link: r.link, hypothesis: r.hypothesis }}
            onUnlinked={() => onUnlinked(r.experimentId, r.hypothesis.id)}
            experimentView
            href={`/dashboard/os/research/experiments/${r.experimentId}?tab=hypotheses`}
          />
        ))}
      </div>
    </section>
  );
}
