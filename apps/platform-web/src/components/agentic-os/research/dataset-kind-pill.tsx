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
  tabular: 'border-os-research/40 text-os-research bg-os-research/10',
  image: 'border-danger/40 text-danger bg-danger/10',
  timeseries: 'border-warning/40 text-warning bg-warning/10',
  sequence: 'border-positive/40 text-positive bg-positive/10',
  sim: 'border-accent/40 text-accent bg-accent/10',
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
