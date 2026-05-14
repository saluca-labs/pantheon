/**
 * CyberSec OS — case list-row card.
 *
 * Server component. Shows severity / status / priority badges + title +
 * excerpt + assignedTo + tags + counts of attached alerts / events / evidence
 * / open tasks. Click routes to the detail page.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import {
  Briefcase,
  AlertTriangle,
  Activity,
  FileText,
  CheckSquare,
  User,
} from 'lucide-react';
import type {
  CaseSeverity,
  CaseStatus,
  CasePriority,
  CaseWithCounts,
} from '@/lib/agentic-os/cyber/cases';

const SEV_STYLE: Record<CaseSeverity, string> = {
  critical: 'text-red-200 bg-red-600/20 border-red-500/50',
  high:     'text-orange-300 bg-orange-500/10 border-orange-500/30',
  medium:   'text-amber-300 bg-amber-500/10 border-amber-500/30',
  low:      'text-blue-300 bg-blue-500/10 border-blue-500/30',
};

const STATUS_STYLE: Record<CaseStatus, string> = {
  open:           'text-sky-300 bg-sky-500/10 border-sky-500/30',
  triage:         'text-violet-300 bg-violet-500/10 border-violet-500/30',
  investigating:  'text-amber-300 bg-amber-500/10 border-amber-500/30',
  contained:      'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  eradicated:     'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  recovered:      'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  closed:         'text-slate-400 bg-slate-500/10 border-slate-500/30',
  false_positive: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

const PRI_STYLE: Record<CasePriority, string> = {
  p1: 'text-red-300 bg-red-500/10',
  p2: 'text-orange-300 bg-orange-500/10',
  p3: 'text-amber-300 bg-amber-500/10',
  p4: 'text-slate-300 bg-slate-500/10',
  p5: 'text-slate-400 bg-slate-500/10',
};

export function CaseCard({ caseItem }: { caseItem: CaseWithCounts }) {
  const excerpt = caseItem.summary
    ? caseItem.summary.length > 140
      ? caseItem.summary.slice(0, 140).trimEnd() + '…'
      : caseItem.summary
    : null;

  return (
    <Link
      href={`/dashboard/os/cyber/cases/${caseItem.id}`}
      className="block rounded-xl border border-border-subtle bg-surface-2 p-4 transition hover:border-accent/60 hover:bg-surface-3"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Briefcase className="w-4 h-4 text-accent shrink-0" />
          <span className="text-sm font-medium text-white truncate">
            {caseItem.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge style={SEV_STYLE[caseItem.severity]}>{caseItem.severity}</Badge>
          <Badge style={STATUS_STYLE[caseItem.status]}>
            {caseItem.status.replace('_', ' ')}
          </Badge>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${
              PRI_STYLE[caseItem.priority]
            }`}
          >
            {caseItem.priority}
          </span>
        </div>
      </div>

      {excerpt && (
        <p className="text-xs text-text-primary mb-2 leading-relaxed">{excerpt}</p>
      )}

      <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary flex-wrap">
        {caseItem.assignedTo && (
          <span className="inline-flex items-center gap-1">
            <User className="w-3 h-3" />
            {caseItem.assignedTo}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {caseItem.alertCount} alert{caseItem.alertCount === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1">
          <Activity className="w-3 h-3" />
          {caseItem.eventCount} event{caseItem.eventCount === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1">
          <FileText className="w-3 h-3" />
          {caseItem.evidenceCount} evidence
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckSquare className="w-3 h-3" />
          {caseItem.openTaskCount} open task{caseItem.openTaskCount === 1 ? '' : 's'}
        </span>
      </div>

      {caseItem.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {caseItem.tags.slice(0, 5).map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-text-secondary"
            >
              {t}
            </span>
          ))}
          {caseItem.tags.length > 5 && (
            <span className="text-[10px] text-text-secondary">
              +{caseItem.tags.length - 5}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function Badge({ style, children }: { style: string; children: React.ReactNode }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${style}`}
    >
      {children}
    </span>
  );
}
