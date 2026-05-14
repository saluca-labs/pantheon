'use client';

/**
 * Autobiographer OS — ChapterSourcesPanel.
 *
 * Right column of the chapter detail page. Lists every memory linked
 * as a provenance source for the chapter, with the paragraph-citation
 * count from the latest revision and an unlink affordance. Hosts the
 * `AddSourceButton` modal in the header.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { useState } from 'react';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { AddSourceButton } from './add-source-button';

export interface SourcePanelRow {
  id: string;
  memoryId: string;
  memoryTitle: string;
  memoryWhenInLife: string | null;
  weight: number;
  paragraphCitationCount: number;
  notes: string | null;
}

interface Props {
  chapterId: string;
  sources: SourcePanelRow[];
}

export function ChapterSourcesPanel({ chapterId, sources }: Props) {
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unlink(memoryId: string) {
    setWorking(memoryId);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/chapters/${chapterId}/sources?memory_id=${memoryId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Unlink failed (${res.status}): ${text}`);
      }
      if (typeof window !== 'undefined') window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlink failed.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <aside className="rounded-xl border border-border-subtle bg-surface-2 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-xs uppercase tracking-wide text-text-secondary">
          Source memories
        </h3>
        <AddSourceButton
          chapterId={chapterId}
          excludedMemoryIds={sources.map((s) => s.memoryId)}
        />
      </div>

      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}

      {sources.length === 0 ? (
        <p className="text-xs text-text-secondary">
          No source memories linked yet. Click <span className="font-medium">Add source</span>{' '}
          to pull a memory into this chapter's provenance trail.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sources.map((s) => (
            <li
              key={s.id}
              className="rounded-md border border-border-subtle bg-surface-0 p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/os/autobiographer/memories/${s.memoryId}`}
                    className="text-sm text-white hover:text-accent truncate block"
                  >
                    {s.memoryTitle}
                  </Link>
                  {s.memoryWhenInLife ? (
                    <p className="text-[11px] text-text-secondary truncate">
                      {s.memoryWhenInLife}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => unlink(s.memoryId)}
                  disabled={working === s.memoryId}
                  title="Unlink from chapter"
                  className="text-text-secondary hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-text-secondary">
                <span className="px-1.5 py-0.5 rounded border border-border-subtle bg-surface-2">
                  weight {s.weight.toFixed(2)}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded border ${
                    s.paragraphCitationCount > 0
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-border-subtle bg-surface-2 text-text-secondary'
                  }`}
                >
                  {s.paragraphCitationCount}{' '}
                  {s.paragraphCitationCount === 1
                    ? 'paragraph cites this'
                    : 'paragraphs cite this'}
                </span>
              </div>
              {s.notes ? (
                <p className="text-[11px] text-text-primary mt-1.5 line-clamp-2">
                  {s.notes}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
