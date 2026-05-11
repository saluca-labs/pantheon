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
import { Plus } from 'lucide-react';
import {
  applyExperimentFilters,
  type SortKey,
  type StatusFilter,
} from '@/lib/agentic-os/research/experiments';
import type { ResearchExperiment } from '@/lib/agentic-os/research/repo';
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

  const visible = useMemo(
    () =>
      applyExperimentFilters(experiments, {
        status: statusFilter,
        sort,
        archived: showArchived,
      }),
    [experiments, statusFilter, sort, showArchived],
  );

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
          className="inline-flex items-center gap-2 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white font-medium px-4 py-2 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          New experiment
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-[#94a3b8]">
          {experiments.length === 0
            ? 'No experiments yet. Create your first experiment above.'
            : showArchived
              ? 'No archived experiments match the current filters.'
              : 'No experiments match the current filters.'}
        </p>
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
