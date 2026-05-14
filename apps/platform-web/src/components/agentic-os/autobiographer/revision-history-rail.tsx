'use client';

/**
 * Autobiographer OS — RevisionHistoryRail.
 *
 * Left column of the chapter detail page. Lists every revision with
 * author chip + created_at + word count, and lets the user select
 * which revision is showing in the center pane. The "New revision"
 * button copies the current body into a fresh user-authored revision.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { RevisionCard, type RevisionCardData } from './revision-card';

interface Props {
  chapterId: string;
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
    <aside className="rounded-xl border border-border-subtle bg-surface-2 p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs uppercase tracking-wide text-text-secondary">
          Revision history
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
      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
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
            />
          ))}
        </div>
      )}
    </aside>
  );
}
