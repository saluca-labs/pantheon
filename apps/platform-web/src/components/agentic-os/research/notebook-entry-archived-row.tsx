'use client';

/**
 * Research OS Phase 2 — Archived-entry row.
 *
 * Compact strip rendered when the timeline is showing archived entries
 * (filter chip `archived = true`). Shows kind pill, title, archived
 * timestamp, and a Restore button. POSTs to
 * `/api/tiresias/agentic-os/research/notebook/:entryId/restore`.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { useState } from 'react';
import { RotateCcw, Archive as ArchiveIcon } from 'lucide-react';
import type { NotebookEntry } from '@/lib/agentic-os/research/notebook-entries';
import { NotebookEntryKindPill } from './notebook-entry-kind-pill';

interface Props {
  entry: NotebookEntry;
  /** Called after a successful restore. */
  onRestored?: (entry: NotebookEntry) => void;
}

function shortIso(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function NotebookEntryArchivedRow({ entry, onRestored }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/research/notebook/${entry.id}/restore`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        setError(
          detail && typeof detail.error === 'string'
            ? detail.error
            : `Failed to restore (${res.status})`,
        );
        return;
      }
      const data = await res.json();
      onRestored?.(data.entry ?? entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex items-center justify-between gap-3 rounded border border-[#2a2d3e] bg-[#0f1117] px-3 py-2"
      data-testid={`archived-row-${entry.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <ArchiveIcon className="w-3.5 h-3.5 text-[#94a3b8] shrink-0" />
        <NotebookEntryKindPill kind={entry.entryKind} />
        <span className="text-sm text-[#cbd5e1] truncate">{entry.title}</span>
        {entry.archivedAt && (
          <span className="text-[10px] text-[#94a3b8] shrink-0">
            archived {shortIso(entry.archivedAt)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {error && (
          <span className="text-[10px] text-rose-300" data-testid={`archived-row-error-${entry.id}`}>
            {error}
          </span>
        )}
        <button
          type="button"
          onClick={handleRestore}
          disabled={submitting}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-[#2a2d3e] bg-[#1a1d27] text-[#cbd5e1] hover:text-white hover:border-[#4361EE]/40"
          data-testid={`archived-row-restore-${entry.id}`}
        >
          <RotateCcw className="w-3 h-3" />
          {submitting ? 'Restoring…' : 'Restore'}
        </button>
      </div>
    </div>
  );
}
