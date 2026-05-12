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
  outline: 'text-[#94a3b8] bg-[#0f1117] border-[#2a2d3e]',
  drafting: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  revised: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  locked: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
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
