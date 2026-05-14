/**
 * CyberSec OS — Playbook list-row card.
 *
 * Server component. Name, lifecycle chip, tactic, tags, step count badge.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { BookText, ListChecks, Hash } from 'lucide-react';
import type { Playbook, PlaybookLifecycle } from '@/lib/agentic-os/cyber/playbooks';

const LIFECYCLE_STYLE: Record<PlaybookLifecycle, string> = {
  draft:      'text-slate-300 bg-slate-500/10 border-slate-500/30',
  testing:    'text-violet-300 bg-violet-500/10 border-violet-500/30',
  active:     'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  deprecated: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  archived:   'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

export function PlaybookCard({ playbook }: { playbook: Playbook }) {
  const stepCount = playbook.steps.length;
  const excerpt = playbook.description
    ? playbook.description.length > 140
      ? playbook.description.slice(0, 140).trimEnd() + '…'
      : playbook.description
    : null;

  return (
    <Link
      href={`/dashboard/os/cyber/playbooks/${playbook.id}`}
      className="block rounded-xl border border-border-subtle bg-surface-2 p-4 transition hover:border-accent/60 hover:bg-surface-3"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <BookText className="w-4 h-4 text-accent shrink-0" />
          <span className="text-sm font-medium text-white truncate">{playbook.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
              LIFECYCLE_STYLE[playbook.lifecycle]
            }`}
          >
            {playbook.lifecycle}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-border-subtle text-text-secondary">
            <ListChecks className="w-3 h-3" />
            {stepCount} step{stepCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {excerpt && (
        <p className="text-xs text-text-primary mb-2 leading-relaxed">{excerpt}</p>
      )}

      <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary flex-wrap">
        {playbook.category && (
          <span className="text-text-secondary/80">{playbook.category}</span>
        )}
        {playbook.tactic && (
          <span className="inline-flex items-center gap-1">
            <Hash className="w-3 h-3" />
            {playbook.tactic}
          </span>
        )}
      </div>

      {playbook.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {playbook.tags.slice(0, 5).map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-text-secondary"
            >
              {t}
            </span>
          ))}
          {playbook.tags.length > 5 && (
            <span className="text-[10px] text-text-secondary">+{playbook.tags.length - 5}</span>
          )}
        </div>
      )}
    </Link>
  );
}
