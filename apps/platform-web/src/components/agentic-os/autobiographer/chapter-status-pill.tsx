/**
 * Autobiographer OS — ChapterStatusPill.
 *
 * Single source of truth for the four-state chapter lifecycle badge.
 * Sized for inline use in card headers + table rows.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import {
  CHAPTER_STATUS_LABELS,
  type ChapterStatus,
} from '@/lib/agentic-os/autobiographer/chapters';

export const CHAPTER_STATUS_COLOR: Record<ChapterStatus, string> = {
  outline: 'text-text-secondary bg-surface-0 border-border-subtle',
  drafting: 'text-accent bg-accent/10 border-accent/30',
  revised: 'text-warning bg-warning/10 border-warning/30',
  locked: 'text-positive bg-positive/10 border-positive/30',
};

export function ChapterStatusPill({ status }: { status: ChapterStatus }) {
  return (
    <span
      className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${CHAPTER_STATUS_COLOR[status]}`}
    >
      {CHAPTER_STATUS_LABELS[status]}
    </span>
  );
}
