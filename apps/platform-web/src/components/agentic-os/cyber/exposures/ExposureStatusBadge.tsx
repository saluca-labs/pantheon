/**
 * CyberSec OS — Exposure status badge.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import type { ExposureStatus } from '@/lib/agentic-os/cyber/exposures';

const STATUS_STYLE: Record<ExposureStatus, string> = {
  open:           'text-red-200 bg-red-600/20 border-red-500/50',
  in_progress:    'text-amber-300 bg-amber-500/10 border-amber-500/30',
  accepted:       'text-slate-300 bg-slate-500/10 border-slate-500/30',
  mitigated:      'text-blue-300 bg-blue-500/10 border-blue-500/30',
  resolved:       'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  false_positive: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
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
