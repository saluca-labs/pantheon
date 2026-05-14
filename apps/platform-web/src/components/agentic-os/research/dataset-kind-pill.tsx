'use client';

/**
 * Research OS Phase 5 — dataset kind pill.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import {
  DATASET_KIND_LABELS,
  type DatasetKind,
} from '@/lib/agentic-os/research/dataset-kinds';

const COLOR: Record<DatasetKind, string> = {
  tabular: 'border-sky-500/40 text-sky-300 bg-sky-500/10',
  image: 'border-rose-500/40 text-rose-300 bg-rose-500/10',
  timeseries: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
  sequence: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  sim: 'border-violet-500/40 text-violet-300 bg-violet-500/10',
  other: 'border-border-subtle text-text-secondary bg-surface-0',
};

export function DatasetKindPill({ kind }: { kind: DatasetKind }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${COLOR[kind]}`}
      data-testid={`dataset-kind-pill-${kind}`}
    >
      {DATASET_KIND_LABELS[kind]}
    </span>
  );
}
