'use client';

/**
 * Research OS — ExperimentList.
 *
 * Card-style experiment list with filter (status) + sort + archived toggle.
 * "New experiment" button opens the create drawer. Mirrors Maker's
 * ProjectsManager UX.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { useMemo, useState } from 'react';
import { Plus, FlaskConical } from 'lucide-react';
import {
  applyExperimentFilters,
  type SortKey,
  type StatusFilter,
} from '@/lib/agentic-os/research/experiments';
import type { ResearchExperiment } from '@/lib/agentic-os/research/repo';
import { EntitySearch, EmptyState } from '@/components/agentic-os/_shared/views';
import { ExperimentCard } from './experiment-card';
import { ExperimentFilters } from './experiment-filters';
import { ExperimentForm } from './experiment-form';

export function ExperimentList({
  initialExperiments,
}: {
  initialExperiments: ResearchExperiment[];
}) {
  const [experiments, setExperiments] = useState<ResearchExperiment[]>(initialExperiments);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('created');
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const filtered = applyExperimentFilters(experiments, {
      status: statusFilter,
      sort,
      archived: showArchived,
    });
    const q = query.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [experiments, statusFilter, sort, showArchived, query]);

  function onCreated(e: ResearchExperiment) {
    setExperiments((prev) => [e, ...prev]);
    setCreating(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <ExperimentFilters
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          sort={sort}
          onSortChange={setSort}
          showArchived={showArchived}
          onShowArchivedChange={setShowArchived}
        />
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-[#3a56d4] text-white font-medium px-4 py-2 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          New experiment
        </button>
      </div>

      <EntitySearch
        placeholder="Search experiments by name, description, or tag"
        debounceMs={0}
        onQueryChange={setQuery}
      />

      {visible.length === 0 ? (
        experiments.length === 0 ? (
          <EmptyState
            icon={<FlaskConical className="h-6 w-6" />}
            title="No experiments yet"
            description="Each experiment is a top-level project with its own lab notebook, hypotheses, literature, and 5-phase lifecycle."
            primaryCta={{
              label: 'New experiment',
              icon: <Plus className="h-4 w-4" />,
              onClick: () => setCreating(true),
            }}
          />
        ) : (
          <EmptyState
            variant="bare"
            icon={<FlaskConical className="h-6 w-6" />}
            title={
              showArchived
                ? 'No archived experiments match'
                : 'No experiments match'
            }
            description="Try clearing the search or adjusting the status filter."
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.map((e) => (
            <ExperimentCard
              key={e.id}
              experiment={{
                id: e.id,
                name: e.name,
                description: e.description,
                status: e.status,
                tags: e.tags,
                coverImageUrl: e.coverImageUrl,
                targetCompletionDate: e.targetCompletionDate,
                teamSize: e.teamSize,
                phaseProgress: e.phaseProgress,
              }}
            />
          ))}
        </div>
      )}

      {creating && (
        <ExperimentForm onClose={() => setCreating(false)} onCreated={onCreated} />
      )}
    </div>
  );
}
