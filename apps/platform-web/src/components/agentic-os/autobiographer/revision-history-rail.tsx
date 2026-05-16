'use client';

/**
 * Autobiographer OS — RevisionHistoryRail.
 *
 * Left column of the chapter editor. A proper revision-history rail
 * (Wave D upgrade from the Wave C inline sidebar): a sticky panel
 * alongside the editor with a revision count header, per-revision
 * word-count deltas, summary previews, and the "New revision" action.
 * Selecting a revision swaps it into the center editor without a page
 * reload. The "New revision" button copies the current body into a
 * fresh user-authored revision.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { useMemo, useState } from 'react';
import { History, Plus } from 'lucide-react';
import { RevisionCard, type RevisionCardData } from './revision-card';

interface Props {
  chapterId: string;
  /** Revisions in version-DESC order (newest first), as the repo returns them. */
  revisions: RevisionCardData[];
  activeRevisionId: string | null;
  onSelect: (revisionId: string) => void;
  /** Optional callback to refresh the page after a new revision lands. */
  onCreate?: () => void;
  /** Body to seed the new revision with (latest revision's body_text). */
  seedBody: string;
}

export function RevisionHistoryRail({
  chapterId,
  revisions,
  activeRevisionId,
  onSelect,
  onCreate,
  seedBody,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Word count of the chronologically-previous revision, keyed by id,
  // so each card can show its delta. `revisions` is version-DESC, so the
  // previous revision is the *next* element in the array.
  const previousWordCountById = useMemo(() => {
    const map = new Map<string, number | null>();
    revisions.forEach((r, i) => {
      const prev = revisions[i + 1];
      map.set(r.id, prev ? prev.wordCount : null);
    });
    return map;
  }, [revisions]);

  async function createRevision() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/chapters/${chapterId}/revisions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            author: 'user',
            bodyText: seedBody,
            summary: null,
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Create failed (${res.status}): ${text}`);
      }
      if (onCreate) {
        onCreate();
      } else if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside
      data-testid="revision-history-rail"
      className="rounded-xl border border-border-subtle bg-surface-2 p-3 space-y-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-text-secondary">
          <History className="w-3.5 h-3.5" />
          Revision history
          <span className="font-mono normal-case text-[10px] text-text-tertiary">
            {revisions.length}
          </span>
        </h3>
        <button
          type="button"
          onClick={createRevision}
          disabled={creating}
          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border-subtle bg-surface-0 text-text-primary hover:border-accent/40 disabled:opacity-60"
        >
          <Plus className="w-3 h-3" />
          {creating ? 'Saving…' : 'New revision'}
        </button>
      </div>
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
      {revisions.length === 0 ? (
        <p className="text-xs text-text-secondary">No revisions yet.</p>
      ) : (
        <div className="space-y-1.5">
          {revisions.map((r) => (
            <RevisionCard
              key={r.id}
              revision={r}
              isActive={r.id === activeRevisionId}
              onSelect={onSelect}
              previousWordCount={previousWordCountById.get(r.id) ?? null}
            />
          ))}
        </div>
      )}
      {revisions.length > 1 ? (
        <p className="pt-1 text-[10px] leading-snug text-text-tertiary">
          Deltas compare each revision to the one before it. Coach
          revisions are read-only.
        </p>
      ) : null}
    </aside>
  );
}
