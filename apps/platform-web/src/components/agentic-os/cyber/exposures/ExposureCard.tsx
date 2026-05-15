/**
 * CyberSec OS — Exposure list-row card.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { ExposureWithRefs } from '@/lib/agentic-os/cyber/exposures';
import { ExposureStatusBadge } from './ExposureStatusBadge';

const PRIORITY_STYLE: Record<string, string> = {
  p1: 'text-danger bg-danger/20 border-danger/50',
  p2: 'text-attention bg-attention/10 border-attention/30',
  p3: 'text-warning bg-warning/10 border-warning/30',
  p4: 'text-accent bg-accent/10 border-accent/30',
  p5: 'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
};

export function ExposureCard({ exposure }: { exposure: ExposureWithRefs }) {
  return (
    <Link
      href={`/dashboard/os/cyber/exposures/${exposure.id}`}
      className="block rounded-xl border border-border-subtle bg-surface-2 p-4 transition hover:border-accent/60 hover:bg-surface-3"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 text-accent shrink-0" />
          <span className="text-sm font-medium text-white truncate">
            {exposure.vulnerabilityCveId ?? '—'} · {exposure.vulnerabilityTitle}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[exposure.priority] ?? ''}`}>
            {exposure.priority}
          </span>
          <ExposureStatusBadge status={exposure.status} />
        </div>
      </div>
      <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary flex-wrap">
        <span>Asset: <span className="text-white/80">{exposure.assetName}</span></span>
        <span>Severity: {exposure.vulnerabilitySeverity}</span>
        <span>Detected {exposure.detectedAt.slice(0, 10)}</span>
        {exposure.assignedTo && <span>→ {exposure.assignedTo}</span>}
        {exposure.remediatedAt && (
          <span className="text-positive">Remediated {exposure.remediatedAt.slice(0, 10)}</span>
        )}
      </div>
    </Link>
  );
}
