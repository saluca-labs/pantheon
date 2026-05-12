'use client';

/**
 * Autobiographer OS — ArcChapterRow.
 *
 * Single row in an arc's chapter list. Renders the chapter title +
 * status, the up/down reorder controls, and a remove button. The
 * reorder controls call the PATCH route with a two-entry payload so the
 * server can swap positions inside the DEFERRABLE-constrained
 * transaction.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface ArcChapterRowProps {
  arcId: string;
  chapterId: string;
  position: number;
  title: string | null;
  status: string;
  total: number;
  index: number;
  /** All neighbour chapter ids + positions, ordered by position ASC. */
  neighbors: Array<{ chapterId: string; position: number }>;
}

export function ArcChapterRow({
  arcId,
  chapterId,
  position,
  title,
  status,
  total,
  index,
  neighbors,
}: ArcChapterRowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function swap(direction: -1 | 1) {
    if (busy) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= total) return;
    const target = neighbors[targetIdx];
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/arcs/${arcId}/chapters`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            entries: [
              { chapter_id: chapterId, position: target.position },
              { chapter_id: target.chapterId, position },
            ],
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to reorder');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Remove this chapter from the arc?')
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/arcs/${arcId}/chapters?chapter_id=${chapterId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to remove');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm">
      <div className="flex flex-col items-center justify-center text-[#94a3b8]">
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      <div className="flex flex-col items-center justify-center">
        <button
          type="button"
          disabled={index === 0 || busy}
          onClick={() => swap(-1)}
          title="Move up"
          className="w-5 h-4 text-[#94a3b8] hover:text-white disabled:opacity-30 flex items-center justify-center"
        >
          <ChevronUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          disabled={index >= total - 1 || busy}
          onClick={() => swap(1)}
          title="Move down"
          className="w-5 h-4 text-[#94a3b8] hover:text-white disabled:opacity-30 flex items-center justify-center"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      <span className="text-[10px] text-[#64748b] w-6 text-right">
        #{position + 1}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-white truncate block">
          {title ?? 'Untitled chapter'}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
          {status}
        </span>
        {error && (
          <span className="text-[10px] text-red-400 block" role="alert">
            {error}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="text-rose-400 hover:text-rose-200 disabled:opacity-50"
        title="Remove from arc"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
