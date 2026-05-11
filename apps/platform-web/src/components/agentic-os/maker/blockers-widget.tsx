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

const API_BASE = '/api/tiresias/agentic-os/maker';
const STALE_MS = 5 * 60 * 1000;

const SEVERITY_STYLE: Record<BlockerSeverity, string> = {
  missed: 'border-red-600/60 text-red-300 bg-red-500/10',
  blocked: 'border-red-500/50 text-red-300 bg-red-500/5',
  overdue: 'border-amber-500/50 text-amber-300 bg-amber-500/5',
  at_risk: 'border-yellow-500/50 text-yellow-300 bg-yellow-500/5',
  open_dependency: 'border-[#4361EE]/50 text-[#cbd5e1] bg-[#4361EE]/5',
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
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide inline-flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          Top blockers
        </h2>
        <Link
          href="/dashboard/os/maker/blockers"
          className="text-[10px] uppercase tracking-wide text-[#4361EE] hover:underline"
        >
          View all
        </Link>
      </div>
      {!loaded && <p className="text-xs text-[#94a3b8]">Loading…</p>}
      {loaded && items.length === 0 && (
        <p className="text-xs text-[#94a3b8]">All clear.</p>
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
              className={`block rounded-md border px-2.5 py-2 hover:bg-[#0f1117] transition ${SEVERITY_STYLE[item.severity]}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide font-medium">
                  {BLOCKER_SEVERITY_LABELS[item.severity]}
                </span>
                <span className="text-[10px] text-[#94a3b8] truncate max-w-[40%]">
                  {item.projectName}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-white line-clamp-2">
                {item.title}
              </p>
              <div className="mt-1 flex items-center gap-3 text-[10px] text-[#94a3b8]">
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
