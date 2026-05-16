'use client';

/**
 * Maker OS — BlockersWidget.
 *
 * Hub-level card showing the top Maker blockers across all of the user's
 * projects. Five items max inline; the "View all" link points at the
 * dedicated workshop blockers page.
 *
 * Hydrates with `useEffect` on focus revalidation (5-min stale clock) and
 * accepts an initial SSR snapshot so the first paint has data.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Calendar, Link as LinkIcon, ShieldAlert } from 'lucide-react';
import {
  BLOCKER_SEVERITY_LABELS,
  type BlockerItem,
  type BlockerSeverity,
} from '@/lib/agentic-os/maker/blockers';
import { SkeletonGroup, Skeleton } from '@/components/agentic-os/_shared/views';

const API_BASE = '/api/tiresias/agentic-os/maker';
const STALE_MS = 5 * 60 * 1000;

const SEVERITY_STYLE: Record<BlockerSeverity, string> = {
  missed: 'border-danger/60 text-danger bg-danger/10',
  blocked: 'border-danger/50 text-danger bg-danger/5',
  overdue: 'border-warning/50 text-warning bg-warning/5',
  at_risk: 'border-warning/50 text-warning bg-warning/5',
  open_dependency: 'border-accent/50 text-text-primary bg-accent/5',
};

interface Props {
  initial?: BlockerItem[];
  limit?: number;
}

export function BlockersWidget({ initial = [], limit = 5 }: Props) {
  const [items, setItems] = useState<BlockerItem[]>(initial);
  const [loaded, setLoaded] = useState(initial.length > 0);
  const [lastFetch, setLastFetch] = useState<number>(initial.length > 0 ? Date.now() : 0);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/blockers?limit=${limit}`);
      if (r.ok) {
        const { items: latest } = await r.json();
        setItems(latest ?? []);
        setLastFetch(Date.now());
      }
    } finally {
      setLoaded(true);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Revalidate on focus when the data is older than STALE_MS.
  useEffect(() => {
    function onFocus() {
      if (Date.now() - lastFetch > STALE_MS) {
        void refresh();
      }
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [lastFetch, refresh]);

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          Top blockers
        </h2>
        <Link
          href="/dashboard/os/maker/blockers"
          className="text-[10px] uppercase tracking-wide text-accent hover:underline"
        >
          View all
        </Link>
      </div>
      {!loaded && (
        <SkeletonGroup>
          <Skeleton variant="list-row" />
          <Skeleton variant="list-row" />
          <Skeleton variant="list-row" />
        </SkeletonGroup>
      )}
      {loaded && items.length === 0 && (
        <p className="text-xs text-text-secondary">All clear.</p>
      )}
      <ul className="space-y-2">
        {items.slice(0, limit).map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <Link
              href={
                item.kind === 'milestone'
                  ? `/dashboard/os/maker/projects/${item.projectId}?tab=milestones`
                  : `/dashboard/os/maker/projects/${item.projectId}?tab=dependencies`
              }
              className={`block rounded-md border px-2.5 py-2 hover:bg-surface-0 transition ${SEVERITY_STYLE[item.severity]}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide font-medium">
                  {BLOCKER_SEVERITY_LABELS[item.severity]}
                </span>
                <span className="text-[10px] text-text-secondary truncate max-w-[40%]">
                  {item.projectName}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-white line-clamp-2">
                {item.title}
              </p>
              <div className="mt-1 flex items-center gap-3 text-[10px] text-text-secondary">
                {item.dueAt && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Due {item.dueAt}
                  </span>
                )}
                {item.kind === 'dependency' && (
                  <span className="inline-flex items-center gap-1">
                    <LinkIcon className="w-3 h-3" />
                    Dependency
                  </span>
                )}
                {item.kind === 'milestone' && (
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Milestone
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
