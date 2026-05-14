'use client';

/**
 * Research OS Phase 2 — Notebook timeline.
 *
 * Reverse-chronological list of NotebookEntryCard. Wires the filter
 * chips, the pinned composer, and a refetch loop tied to the filter
 * state. Behaves identically for active and archived modes — only the
 * card variant changes (card vs archived row).
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
import { BookOpen } from 'lucide-react';
import type { NotebookEntry } from '@/lib/agentic-os/research/notebook-entries';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import { NotebookEntryComposer } from './notebook-entry-composer';
import {
  NotebookEntryFilterChips,
  type EntryKindFilter,
} from './notebook-entry-filter-chips';
import { NotebookEntryCard } from './notebook-entry-card';
import { NotebookEntryArchivedRow } from './notebook-entry-archived-row';

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

  return (
    <div data-testid="notebook-timeline">
      {!archived && (
        <NotebookEntryComposer
          experimentId={experimentId}
          onCreated={() => refetch()}
        />
      )}

      <NotebookEntryFilterChips
        kind={kind}
        tag={tag}
        archived={archived}
        onKindChange={setKind}
        onTagChange={setTag}
        onArchivedChange={setArchived}
      />

      {error && (
        <div
          className="rounded border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs px-3 py-2 mb-3"
          data-testid="notebook-timeline-error"
        >
          {error}
        </div>
      )}

      {loading && entries.length === 0 ? (
        <p className="text-xs text-text-secondary" data-testid="notebook-timeline-loading">
          Loading…
        </p>
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
