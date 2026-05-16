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
  pending: 'text-text-secondary bg-surface-0 border-border-subtle',
  passed: 'text-positive bg-positive/10 border-positive/30',
  waived: 'text-os-research bg-os-research/10 border-os-research/30',
  failed: 'text-danger bg-danger/10 border-danger/30',
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
