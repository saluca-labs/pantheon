/**
 * Autobiographer OS — ReviewCheckStatusPill.
 *
 * Single source of truth for the four-state review-check status badge.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import {
  REVIEW_CHECK_STATUS_LABELS,
  type ReviewCheckStatus,
} from '@/lib/agentic-os/autobiographer/review-checks';

export const REVIEW_CHECK_STATUS_COLOR: Record<ReviewCheckStatus, string> = {
  pending: 'text-[#94a3b8] bg-[#0f1117] border-[#2a2d3e]',
  passed: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  waived: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  failed: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
};

export function ReviewCheckStatusPill({
  status,
}: {
  status: ReviewCheckStatus;
}) {
  return (
    <span
      className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${REVIEW_CHECK_STATUS_COLOR[status]}`}
    >
      {REVIEW_CHECK_STATUS_LABELS[status]}
    </span>
  );
}
