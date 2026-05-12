'use client';

/**
 * Autobiographer OS — BookChapterList.
 *
 * The book detail page's chapter section. Renders position-ordered
 * chapter rows with the reorder handle on the left, the card body in
 * the middle, and a delete-affordance to come in Phase 5 cleanup.
 *
 * Phase 4 spec: the "primary arc is default" gate is hardcoded `false`
 * — drag-to-reorder is enabled. When Phase 5 lands the gate flips to
 * a server-resolved feature flag.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { ChapterCard, type ChapterCardData } from './chapter-card';
import { ChapterReorderHandle } from './chapter-reorder-handle';

export interface BookChapterListProps {
  chapters: ChapterCardData[];
  /** Phase 5 seam — hardcoded false in Phase 4. */
  primaryArcIsDefault?: boolean;
}

export function BookChapterList({
  chapters,
  primaryArcIsDefault = false,
}: BookChapterListProps) {
  if (chapters.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27]/50 p-6 text-center text-sm text-[#94a3b8]">
        No chapters yet — create the first one with the button in the section
        header.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {chapters.map((c) => (
        <div key={c.id} className="flex items-stretch gap-2">
          <div className="flex items-center">
            <ChapterReorderHandle
              chapterId={c.id}
              position={c.position}
              total={chapters.length}
              disabled={primaryArcIsDefault}
            />
          </div>
          <div className="flex-1">
            <ChapterCard chapter={c} />
          </div>
        </div>
      ))}
    </div>
  );
}
