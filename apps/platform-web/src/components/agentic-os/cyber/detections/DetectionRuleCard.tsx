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
  critical: 'text-danger bg-danger/20 border-danger/50',
  high:     'text-attention bg-attention/10 border-attention/30',
  medium:   'text-warning bg-warning/10 border-warning/30',
  low:      'text-accent bg-accent/10 border-accent/30',
  info:     'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
};

const LIFECYCLE_STYLE: Record<DetectionLifecycle, string> = {
  draft:      'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
  testing:    'text-accent bg-accent/10 border-accent/30',
  active:     'text-positive bg-positive/10 border-positive/30',
  deprecated: 'text-warning bg-warning/10 border-warning/30',
  archived:   'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
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
      className="block rounded-xl border border-border-subtle bg-surface-2 p-4 transition hover:border-accent/60 hover:bg-surface-3"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-accent shrink-0" />
          <span className="text-sm font-medium text-white truncate">{rule.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge style={SEV_STYLE[rule.severity]}>{rule.severity}</Badge>
          <Badge style={LIFECYCLE_STYLE[rule.lifecycle]}>{rule.lifecycle}</Badge>
        </div>
      </div>

      {excerpt && (
        <p className="text-xs text-text-primary mb-2 leading-relaxed">{excerpt}</p>
      )}

      <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary flex-wrap">
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
          <span className="text-text-secondary/80">by {rule.author}</span>
        )}
      </div>

      {rule.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {rule.tags.slice(0, 5).map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-text-secondary"
            >
              {t}
            </span>
          ))}
          {rule.tags.length > 5 && (
            <span className="text-[10px] text-text-secondary">+{rule.tags.length - 5}</span>
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
