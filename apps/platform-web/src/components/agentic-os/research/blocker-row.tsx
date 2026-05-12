'use client';

/**
 * Research OS Phase 6 — single blocker row.
 *
 * Handles both `milestone` and `dependency` kinds via the `kind`
 * discriminator on `BlockerItem`. Links to the experiment's milestone
 * tab or dependency tab depending on kind.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import Link from 'next/link';
import { AlertTriangle, Calendar, Link as LinkIcon } from 'lucide-react';
import {
  BLOCKER_SEVERITY_LABELS,
  type BlockerItem,
  type BlockerSeverity,
} from '@/lib/agentic-os/research/blockers';

const SEVERITY_STYLE: Record<BlockerSeverity, string> = {
  high: 'border-red-500/60 text-red-300 bg-red-500/10',
  medium: 'border-amber-500/50 text-amber-300 bg-amber-500/5',
};

interface Props {
  item: BlockerItem;
}

export function BlockerRow({ item }: Props) {
  const href =
    item.kind === 'milestone'
      ? `/dashboard/os/research/experiments/${item.experimentId}?tab=milestones`
      : `/dashboard/os/research/experiments/${item.experimentId}?tab=dependencies`;
  return (
    <Link
      href={href}
      className={`block rounded-md border px-2.5 py-2 hover:bg-[#0f1117] transition ${SEVERITY_STYLE[item.severity]}`}
      data-testid={`blocker-row-${item.kind}-${item.id}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide font-medium">
          {BLOCKER_SEVERITY_LABELS[item.severity]}
        </span>
        <span className="text-[10px] text-[#94a3b8] truncate max-w-[40%]">
          {item.experimentName}
        </span>
      </div>
      <p className="mt-1 text-xs font-medium text-white line-clamp-2">{item.title}</p>
      <div className="mt-1 flex items-center gap-3 text-[10px] text-[#94a3b8]">
        {item.dueAt && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Due {item.dueAt}
          </span>
        )}
        {item.kind === 'dependency' ? (
          <span className="inline-flex items-center gap-1">
            <LinkIcon className="w-3 h-3" />
            Dependency
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Milestone
          </span>
        )}
      </div>
      {item.reason && (
        <p className="mt-1 text-[10px] text-[#cbd5e1] whitespace-pre-wrap line-clamp-2">
          {item.reason}
        </p>
      )}
    </Link>
  );
}
