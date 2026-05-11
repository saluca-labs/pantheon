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
  p1: 'text-red-200 bg-red-600/20 border-red-500/50',
  p2: 'text-orange-300 bg-orange-500/10 border-orange-500/30',
  p3: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  p4: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  p5: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
};

export function ExposureCard({ exposure }: { exposure: ExposureWithRefs }) {
  return (
    <Link
      href={`/dashboard/os/cyber/exposures/${exposure.id}`}
      className="block rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 transition hover:border-[#4361EE]/60 hover:bg-[#1f2230]"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 text-[#4361EE] shrink-0" />
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
      <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-[#94a3b8] flex-wrap">
        <span>Asset: <span className="text-white/80">{exposure.assetName}</span></span>
        <span>Severity: {exposure.vulnerabilitySeverity}</span>
        <span>Detected {exposure.detectedAt.slice(0, 10)}</span>
        {exposure.assignedTo && <span>→ {exposure.assignedTo}</span>}
        {exposure.remediatedAt && (
          <span className="text-emerald-300">Remediated {exposure.remediatedAt.slice(0, 10)}</span>
        )}
      </div>
    </Link>
  );
}
