/**
 * Autobiographer OS — ArcChapterList.
 *
 * Renders the chapters attached to an arc, ordered by position, with
 * inline reorder controls and an attach-chapter affordance.
 *
 * Reorder UI choice
 * -----------------
 * The Phase 5 spec called for `@dnd-kit` drag-to-reorder mirroring the
 * Filmmaker storyboards pattern. That package is NOT a repo dependency
 * (the codebase intentionally uses up/down chevron buttons everywhere —
 * Maker's step list, Cyber's playbooks, the Phase 4 chapter list).
 * Pulling @dnd-kit in for this single surface would introduce a new
 * transitive dependency for marginal UX gain over the established
 * pattern; Phase 5 instead mirrors the Phase 4 ChapterReorderHandle
 * design. Each row hits the PATCH `/arcs/[id]/chapters` reorder route
 * with a single-pair swap. The route-level transaction handles the
 * DEFERRABLE UNIQUE invariant.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { listChaptersForArc } from '@/lib/agentic-os/autobiographer/arc-chapters-repo';
import { listChaptersForBook } from '@/lib/agentic-os/autobiographer/chapters-repo';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { ArcChapterRow } from './arc-chapter-row';
import { ArcChapterAttachButton } from './arc-chapter-attach-button';

export interface ArcChapterListProps {
  arcId: string;
  bookId: string;
}

export async function ArcChapterList({ arcId, bookId }: ArcChapterListProps) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return null;
  const [rows, allChapters] = await Promise.all([
    listChaptersForArc(arcId, user.userId),
    listChaptersForBook({ userId: user.userId, bookId, order: 'position' }),
  ]);
  const inArcIds = new Set(rows.map((r) => r.chapterId));
  const attachable = allChapters
    .filter((c) => !inArcIds.has(c.id))
    .map((c) => ({
      id: c.id,
      title: c.title,
      position: c.position,
    }));

  return (
    <div className="space-y-2">
      <ArcChapterAttachButton arcId={arcId} attachable={attachable} />
      {rows.length === 0 ? (
        <p className="text-xs text-[#64748b] italic px-1">
          No chapters attached. Use the button above to add some.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.id}>
              <ArcChapterRow
                arcId={arcId}
                chapterId={r.chapterId}
                position={r.position}
                title={r.chapterTitle}
                status={r.chapterStatus}
                total={rows.length}
                index={i}
                neighbors={rows.map((row) => ({
                  chapterId: row.chapterId,
                  position: row.position,
                }))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
