'use client';

/**
 * Research OS Phase 5 — dataset list (per-experiment).
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Dataset } from '@/lib/agentic-os/research/datasets';
import {
  DATASET_KINDS,
  DATASET_KIND_LABELS,
  type DatasetKind,
} from '@/lib/agentic-os/research/dataset-kinds';
import { DatasetCard } from './dataset-card';
import { DatasetForm } from './dataset-form';

interface Props {
  experimentId: string;
  initialDatasets: Dataset[];
}

export function DatasetList({ experimentId, initialDatasets }: Props) {
  const [kindFilter, setKindFilter] = useState<DatasetKind | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const filtered = initialDatasets.filter((d) => {
    if (kindFilter !== 'all' && d.kind !== kindFilter) return false;
    if (!showArchived && d.archived) return false;
    return true;
  });

  return (
    <div className="space-y-3" data-testid="dataset-list">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setKindFilter('all')}
            className={`text-xs px-2 py-1 rounded-full border transition ${
              kindFilter === 'all'
                ? 'bg-accent/20 border-accent/60 text-white'
                : 'bg-surface-0 border-border-subtle text-text-secondary hover:border-accent/40'
            }`}
          >
            All kinds
          </button>
          {DATASET_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(kindFilter === k ? 'all' : k)}
              className={`text-xs px-2 py-1 rounded-full border transition ${
                kindFilter === k
                  ? 'bg-accent/20 border-accent/60 text-white'
                  : 'bg-surface-0 border-border-subtle text-text-secondary hover:border-accent/40'
              }`}
              data-testid={`dataset-list-kind-chip-${k}`}
            >
              {DATASET_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-accent"
            />
            Show archived raw
          </label>
          <button
            type="button"
            onClick={() => setFormOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/80 transition"
            data-testid="dataset-list-add"
          >
            <Plus className="w-3 h-3" />
            Add dataset
          </button>
        </div>
      </div>

      {formOpen && (
        <DatasetForm
          experimentId={experimentId}
          onClose={() => setFormOpen(false)}
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-text-secondary italic py-6 text-center" data-testid="dataset-list-empty">
          No datasets attached yet. Click <strong>Add dataset</strong> to record a
          URL + version + checksum.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <DatasetCard key={d.id} dataset={d} />
          ))}
        </div>
      )}
    </div>
  );
}
