'use client';

/**
 * Autobiographer OS — ChapterReorderHandle.
 *
 * Minimal drag-handle button for the book detail chapter list. Phase 4
 * implements a simple two-button move-up / move-down interaction
 * because @dnd-kit (or react-dnd) is not yet a repo dependency. The
 * gated flag `primaryArcIsDefault` is hardcoded `false` per the Phase
 * 4 spec — drag is enabled, position-based ordering applies.
 *
 * When Phase 5 ships arc ordering, the parent list will pass
 * `primaryArcIsDefault={true}` to disable position writes; the handle
 * renders as a static icon in that mode.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { useState } from 'react';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';

interface Props {
  chapterId: string;
  position: number;
  /** Total chapter count in the book (so we can hide down when at end). */
  total: number;
  /** Hard-disable when the arc-is-default flag is on (Phase 5). */
  disabled?: boolean;
}

export function ChapterReorderHandle({
  chapterId,
  position,
  total,
  disabled = false,
}: Props) {
  const [working, setWorking] = useState(false);

  async function move(direction: -1 | 1) {
    if (disabled || working) return;
    const next = position + direction;
    if (next < 0 || next >= total) return;
    setWorking(true);
    try {
      await fetch(`/api/tiresias/agentic-os/autobiographer/chapters/${chapterId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ position: next }),
      });
      if (typeof window !== 'undefined') window.location.reload();
    } finally {
      setWorking(false);
    }
  }

  if (disabled) {
    return (
      <span
        title="Ordering is controlled by the active arc"
        className="inline-flex items-center justify-center w-6 h-6 text-[#64748b]"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-center justify-center">
      <button
        type="button"
        disabled={position === 0 || working}
        onClick={() => move(-1)}
        title="Move up"
        className="w-6 h-4 text-text-secondary hover:text-white disabled:opacity-30 disabled:hover:text-text-secondary flex items-center justify-center"
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        disabled={position >= total - 1 || working}
        onClick={() => move(1)}
        title="Move down"
        className="w-6 h-4 text-text-secondary hover:text-white disabled:opacity-30 disabled:hover:text-text-secondary flex items-center justify-center"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
