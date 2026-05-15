/**
 * CyberSec OS — Exposure status badge.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import type { ExposureStatus } from '@/lib/agentic-os/cyber/exposures';

const STATUS_STYLE: Record<ExposureStatus, string> = {
  open:           'text-danger bg-danger/20 border-danger/50',
  in_progress:    'text-warning bg-warning/10 border-warning/30',
  accepted:       'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
  mitigated:      'text-accent bg-accent/10 border-accent/30',
  resolved:       'text-positive bg-positive/10 border-positive/30',
  false_positive: 'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
};

const STATUS_LABEL: Record<ExposureStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  accepted: 'Accepted',
  mitigated: 'Mitigated',
  resolved: 'Resolved',
  false_positive: 'False positive',
};

export function ExposureStatusBadge({ status }: { status: ExposureStatus }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
