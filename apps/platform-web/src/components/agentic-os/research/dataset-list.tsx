'use client';

/**
 * Research OS Phase 5 — dataset list (per-experiment).
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { useState } from 'react';
import { Plus, Database } from 'lucide-react';
import type { Dataset } from '@/lib/agentic-os/research/datasets';
import {
  DATASET_KINDS,
  DATASET_KIND_LABELS,
  type DatasetKind,
} from '@/lib/agentic-os/research/dataset-kinds';
import {
  EmptyState,
  KindFilterChips,
} from '@/components/agentic-os/_shared/views';
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
        <KindFilterChips<DatasetKind>
          value={kindFilter === 'all' ? null : kindFilter}
          onChange={(next) => setKindFilter(next ?? 'all')}
          options={DATASET_KINDS.map((k) => ({
            value: k,
            label: DATASET_KIND_LABELS[k],
            testId: `dataset-list-kind-chip-${k}`,
          }))}
          allLabel="All kinds"
          ariaLabel="Filter datasets by kind"
        />
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
        <div data-testid="dataset-list-empty">
          <EmptyState
            icon={<Database className="h-6 w-6" />}
            title="No datasets attached yet"
            description="Per-experiment dataset pointers — URL, version, and checksum. The binary content is governed by the MCP storage-transfer contract."
            primaryCta={{
              label: 'Add dataset',
              icon: <Plus className="h-4 w-4" />,
              onClick: () => setFormOpen(true),
            }}
          />
        </div>
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
