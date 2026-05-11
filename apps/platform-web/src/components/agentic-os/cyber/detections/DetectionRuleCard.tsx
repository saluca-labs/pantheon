/**
 * CyberSec OS — Detection rule list-row card.
 *
 * Severity badge, lifecycle chip, tactic + technique chips, log_source_kind
 * tag, click-through to detail page.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { Shield, Hash, Database } from 'lucide-react';
import type {
  DetectionLifecycle,
  DetectionRule,
  DetectionSeverity,
} from '@/lib/agentic-os/cyber/detections';

const SEV_STYLE: Record<DetectionSeverity, string> = {
  critical: 'text-red-200 bg-red-600/20 border-red-500/50',
  high:     'text-orange-300 bg-orange-500/10 border-orange-500/30',
  medium:   'text-amber-300 bg-amber-500/10 border-amber-500/30',
  low:      'text-blue-300 bg-blue-500/10 border-blue-500/30',
  info:     'text-slate-300 bg-slate-500/10 border-slate-500/30',
};

const LIFECYCLE_STYLE: Record<DetectionLifecycle, string> = {
  draft:      'text-slate-300 bg-slate-500/10 border-slate-500/30',
  testing:    'text-violet-300 bg-violet-500/10 border-violet-500/30',
  active:     'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  deprecated: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  archived:   'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

export function DetectionRuleCard({ rule }: { rule: DetectionRule }) {
  const excerpt = rule.description
    ? rule.description.length > 140
      ? rule.description.slice(0, 140).trimEnd() + '…'
      : rule.description
    : null;

  return (
    <Link
      href={`/dashboard/os/cyber/detections/${rule.id}`}
      className="block rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 transition hover:border-[#4361EE]/60 hover:bg-[#1f2230]"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-[#4361EE] shrink-0" />
          <span className="text-sm font-medium text-white truncate">{rule.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge style={SEV_STYLE[rule.severity]}>{rule.severity}</Badge>
          <Badge style={LIFECYCLE_STYLE[rule.lifecycle]}>{rule.lifecycle}</Badge>
        </div>
      </div>

      {excerpt && (
        <p className="text-xs text-[#cbd5e1] mb-2 leading-relaxed">{excerpt}</p>
      )}

      <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-[#94a3b8] flex-wrap">
        {rule.tactic && (
          <span className="inline-flex items-center gap-1">
            <Hash className="w-3 h-3" />
            {rule.tactic}
          </span>
        )}
        {rule.technique && (
          <span className="inline-flex items-center gap-1">
            <Hash className="w-3 h-3" />
            {rule.technique}
          </span>
        )}
        {rule.logSourceKind && (
          <span className="inline-flex items-center gap-1">
            <Database className="w-3 h-3" />
            {rule.logSourceKind}
          </span>
        )}
        {rule.author && (
          <span className="text-[#94a3b8]/80">by {rule.author}</span>
        )}
      </div>

      {rule.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {rule.tags.slice(0, 5).map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded border border-[#2a2d3e] text-[#94a3b8]"
            >
              {t}
            </span>
          ))}
          {rule.tags.length > 5 && (
            <span className="text-[10px] text-[#94a3b8]">+{rule.tags.length - 5}</span>
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
