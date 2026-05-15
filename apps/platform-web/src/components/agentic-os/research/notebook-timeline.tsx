'use client';

/**
 * Research OS Phase 2 + Wave D — Notebook timeline.
 *
 * Hosts the lab-notebook entries for one experiment. Wires the kind-filter
 * chips, the pinned composer, a refetch loop tied to the filter state, and
 * — Wave D — a list / timeline view toggle.
 *
 *  - **List** view: the original reverse-chronological `NotebookEntryCard`
 *    stack (unchanged behaviour; archived mode swaps the archived row).
 *  - **Timeline** view: `NotebookEntryTimeline`, which renders the same
 *    entries on the shared `TimelineView` primitive — one lane per entry
 *    kind, each entry a clickable point.
 *
 * Neither view nor any capability is removed; the toggle just changes how
 * the same filtered entry set is drawn. Archived mode pins to the list
 * view (restore affordances live on the archived row).
 *
 * Lives client-side: the parent page hands us the initial list (server-
 * rendered for SEO + speed of first paint) and we manage all filter
 * changes + mutations locally. We refetch whenever the filters change
 * AND on every successful create/update/archive/restore so the timeline
 * always matches the DB.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, List, GanttChartSquare } from 'lucide-react';
import type { NotebookEntry } from '@/lib/agentic-os/research/notebook-entries';
import {
  EmptyState,
  SkeletonGroup,
  Skeleton,
} from '@/components/agentic-os/_shared/views';
import { NotebookEntryComposer } from './notebook-entry-composer';
import {
  NotebookEntryFilterChips,
  type EntryKindFilter,
} from './notebook-entry-filter-chips';
import { NotebookEntryCard } from './notebook-entry-card';
import { NotebookEntryArchivedRow } from './notebook-entry-archived-row';
import { NotebookEntryTimeline } from './notebook-entry-timeline';

type NotebookViewMode = 'list' | 'timeline';

interface Props {
  experimentId: string;
  initialEntries: NotebookEntry[];
}

export function NotebookTimeline({ experimentId, initialEntries }: Props) {
  const [entries, setEntries] = useState<NotebookEntry[]>(initialEntries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<EntryKindFilter>('all');
  const [tag, setTag] = useState('');
  const [archived, setArchived] = useState(false);
  const [view, setView] = useState<NotebookViewMode>('list');

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/notebook`,
        window.location.origin,
      );
      if (kind !== 'all') url.searchParams.set('entry_kind', kind);
      if (tag.trim()) url.searchParams.set('tag', tag.trim());
      if (archived) url.searchParams.set('archived', 'true');
      const res = await fetch(url.toString());
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        setError(
          detail && typeof detail.error === 'string'
            ? detail.error
            : `Failed to load timeline (${res.status})`,
        );
        return;
      }
      const data = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [experimentId, kind, tag, archived]);

  // Refetch on filter change.
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Archived entries only make sense in the list view (restore affordances
  // live on the archived row) — pin back to list when archived flips on.
  const effectiveView: NotebookViewMode = archived ? 'list' : view;

  return (
    <div data-testid="notebook-timeline">
      {!archived && (
        <NotebookEntryComposer
          experimentId={experimentId}
          onCreated={() => refetch()}
        />
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <NotebookEntryFilterChips
          kind={kind}
          tag={tag}
          archived={archived}
          onKindChange={setKind}
          onTagChange={setTag}
          onArchivedChange={setArchived}
        />

        {!archived && (
          <div
            className="inline-flex items-center rounded-md border border-border-subtle bg-surface-0 p-0.5"
            role="group"
            aria-label="Notebook view mode"
            data-testid="notebook-view-toggle"
          >
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={effectiveView === 'list'}
              data-testid="notebook-view-list"
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition ${
                effectiveView === 'list'
                  ? 'bg-accent/20 text-white'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              <List className="w-3 h-3" />
              List
            </button>
            <button
              type="button"
              onClick={() => setView('timeline')}
              aria-pressed={effectiveView === 'timeline'}
              data-testid="notebook-view-timeline"
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition ${
                effectiveView === 'timeline'
                  ? 'bg-accent/20 text-white'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              <GanttChartSquare className="w-3 h-3" />
              Timeline
            </button>
          </div>
        )}
      </div>

      {error && (
        <div
          className="rounded border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs px-3 py-2 mb-3"
          data-testid="notebook-timeline-error"
        >
          {error}
        </div>
      )}

      {loading && entries.length === 0 ? (
        <SkeletonGroup data-testid="notebook-timeline-loading">
          <Skeleton variant="list-row" />
          <Skeleton variant="list-row" />
          <Skeleton variant="list-row" />
        </SkeletonGroup>
      ) : entries.length === 0 ? (
        <div data-testid="notebook-timeline-empty">
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title={archived ? 'No archived entries' : 'No entries yet'}
            description={
              archived
                ? 'Archived entries will appear here when you archive them.'
                : 'Add your first note, observation, result, decision, question, or to-do above.'
            }
          />
        </div>
      ) : effectiveView === 'timeline' ? (
        <NotebookEntryTimeline
          entries={entries}
          kind={kind}
          onMutated={() => refetch()}
        />
      ) : (
        <div className="space-y-3">
          {entries.map((entry) =>
            archived ? (
              <NotebookEntryArchivedRow
                key={entry.id}
                entry={entry}
                onRestored={() => refetch()}
              />
            ) : (
              <NotebookEntryCard
                key={entry.id}
                entry={entry}
                onUpdated={() => refetch()}
                onArchived={() => refetch()}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
