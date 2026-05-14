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

import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/agentic-os/_shared/views';
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
      <EmptyState
        icon={<FileText className="h-6 w-6" />}
        title="No chapters yet"
        description="Create the first one with the button in the section header."
      />
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
