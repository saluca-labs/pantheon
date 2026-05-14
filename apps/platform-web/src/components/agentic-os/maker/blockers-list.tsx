'use client';

/**
 * Maker OS — BlockersList.
 *
 * Full workshop-wide blockers list grouped by project. Filter chips for
 * item kind (milestone / dependency) and severity. The dataset is fetched
 * with limit=100 so the user can drill the whole feed in one place.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Calendar, Link as LinkIcon, ShieldAlert } from 'lucide-react';
import {
  BLOCKER_ITEM_KINDS,
  BLOCKER_SEVERITIES,
  BLOCKER_SEVERITY_LABELS,
  type BlockerItem,
  type BlockerItemKind,
  type BlockerSeverity,
} from '@/lib/agentic-os/maker/blockers';

const API_BASE = '/api/tiresias/agentic-os/maker';

const SEVERITY_STYLE: Record<BlockerSeverity, string> = {
  missed: 'border-red-600/60 text-red-300 bg-red-500/10',
  blocked: 'border-red-500/50 text-red-300 bg-red-500/5',
  overdue: 'border-amber-500/50 text-amber-300 bg-amber-500/5',
  at_risk: 'border-yellow-500/50 text-yellow-300 bg-yellow-500/5',
  open_dependency: 'border-accent/50 text-text-primary bg-accent/5',
};

interface Props {
  initial?: BlockerItem[];
}

export function BlockersList({ initial = [] }: Props) {
  const [items, setItems] = useState<BlockerItem[]>(initial);
  const [loaded, setLoaded] = useState(initial.length > 0);
  const [kindFilter, setKindFilter] = useState<BlockerItemKind | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<BlockerSeverity | 'all'>('all');

  const refresh = useCallback(async () => {
    const r = await fetch(`${API_BASE}/blockers?limit=100`);
    if (r.ok) {
      const { items: latest } = await r.json();
      setItems(latest ?? []);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (kindFilter === 'all' || i.kind === kindFilter) &&
          (severityFilter === 'all' || i.severity === severityFilter),
      ),
    [items, kindFilter, severityFilter],
  );

  // Group by project for the rendered list.
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { projectId: string; projectName: string; items: BlockerItem[] }
    >();
    for (const item of filtered) {
      const entry = map.get(item.projectId);
      if (entry) {
        entry.items.push(item);
      } else {
        map.set(item.projectId, {
          projectId: item.projectId,
          projectName: item.projectName,
          items: [item],
        });
      }
    }
    return Array.from(map.values());
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-text-secondary">Kind</span>
        <Chip
          active={kindFilter === 'all'}
          onClick={() => setKindFilter('all')}
          label="All"
        />
        {BLOCKER_ITEM_KINDS.map((k) => (
          <Chip
            key={k}
            active={kindFilter === k}
            onClick={() => setKindFilter(k)}
            label={k === 'milestone' ? 'Milestone' : 'Dependency'}
          />
        ))}
        <span className="ml-3 text-[10px] uppercase tracking-wide text-text-secondary">
          Severity
        </span>
        <Chip
          active={severityFilter === 'all'}
          onClick={() => setSeverityFilter('all')}
          label="All"
        />
        {BLOCKER_SEVERITIES.map((s) => (
          <Chip
            key={s}
            active={severityFilter === s}
            onClick={() => setSeverityFilter(s)}
            label={BLOCKER_SEVERITY_LABELS[s]}
          />
        ))}
      </div>

      {!loaded && <p className="text-xs text-text-secondary">Loading…</p>}
      {loaded && grouped.length === 0 && (
        <div className="rounded-lg border border-dashed border-border-subtle bg-surface-2/30 p-8 text-center">
          <ShieldAlert className="w-6 h-6 text-accent mx-auto mb-2" />
          <p className="text-sm text-white">All clear.</p>
          <p className="text-xs text-text-secondary mt-1">
            No active blockers across your Maker projects.
          </p>
        </div>
      )}

      {grouped.map((group) => (
        <div
          key={group.projectId}
          className="rounded-xl border border-border-subtle bg-surface-2 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">{group.projectName}</h3>
            <Link
              href={`/dashboard/os/maker/projects/${group.projectId}`}
              className="text-[10px] uppercase tracking-wide text-accent hover:underline"
            >
              Open project
            </Link>
          </div>
          <ul className="space-y-2">
            {group.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={
                    item.kind === 'milestone'
                      ? `/dashboard/os/maker/projects/${item.projectId}?tab=milestones`
                      : `/dashboard/os/maker/projects/${item.projectId}?tab=dependencies`
                  }
                  className={`block rounded-md border px-3 py-2 hover:bg-surface-0 transition ${SEVERITY_STYLE[item.severity]}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide font-medium">
                      {BLOCKER_SEVERITY_LABELS[item.severity]}
                    </span>
                    <span className="text-[10px] text-text-secondary">
                      {item.kind === 'milestone' ? (
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Milestone
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <LinkIcon className="w-3 h-3" />
                          Dependency
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-white">{item.title}</p>
                  {item.dueAt && (
                    <p className="mt-1 text-xs text-text-secondary inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Due {item.dueAt}
                    </p>
                  )}
                  {item.reason && (
                    <p className="mt-2 text-xs text-text-primary whitespace-pre-wrap">
                      {item.reason}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-wide transition ${
        active
          ? 'border-accent bg-accent/10 text-white'
          : 'border-border-subtle text-text-secondary hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}
