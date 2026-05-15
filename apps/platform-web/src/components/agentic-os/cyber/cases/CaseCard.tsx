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
  critical: 'text-danger bg-danger/20 border-danger/50',
  high:     'text-attention bg-attention/10 border-attention/30',
  medium:   'text-warning bg-warning/10 border-warning/30',
  low:      'text-accent bg-accent/10 border-accent/30',
};

const STATUS_STYLE: Record<CaseStatus, string> = {
  open:           'text-os-research bg-os-research/10 border-os-research/30',
  triage:         'text-accent bg-accent/10 border-accent/30',
  investigating:  'text-warning bg-warning/10 border-warning/30',
  contained:      'text-positive bg-positive/10 border-positive/30',
  eradicated:     'text-positive bg-positive/10 border-positive/30',
  recovered:      'text-positive bg-positive/10 border-positive/30',
  closed:         'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
  false_positive: 'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
};

const PRI_STYLE: Record<CasePriority, string> = {
  p1: 'text-danger bg-danger/10',
  p2: 'text-attention bg-attention/10',
  p3: 'text-warning bg-warning/10',
  p4: 'text-text-secondary bg-text-secondary/10',
  p5: 'text-text-secondary bg-text-secondary/10',
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
