'use client';

/**
 * Maker OS — BlockersList.
 *
 * Full workshop-wide blockers list grouped by project. Filter chips for
 * item kind (milestone / dependency) and severity, plus — Wave C-3a — a
 * client-side in-hub search over blocker / project titles and saved filter
 * presets. The dataset is fetched with limit=100 so the user can drill the
 * whole feed in one place.
 *
 * Wave C-3a primitive adoption:
 *  - `MakerListControls` (EntitySearch + SavedViews) adds the search input +
 *    saved presets above the list. The kind / severity chip rows stay
 *    ad-hoc — `EntitySearch` has no declarative filter-chip API yet (known
 *    gap), so they move into the controls' `filterControls` slot unchanged.
 *  - `EmptyState` replaces the ad-hoc "All clear" panel.
 *
 * Behavior-preserving: the limit=100 fetch, the project grouping, and every
 * deep-link (`?tab=milestones` / `?tab=dependencies`) are unchanged.
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
import {
  EmptyState,
  KindFilterChips,
} from '@/components/agentic-os/_shared/views';
import { MakerListControls, type MakerQuery } from './maker-list-controls';

const API_BASE = '/api/tiresias/agentic-os/maker';

const SEVERITY_STYLE: Record<BlockerSeverity, string> = {
  missed: 'border-red-600/60 text-red-300 bg-red-500/10',
  blocked: 'border-red-500/50 text-red-300 bg-red-500/5',
  overdue: 'border-amber-500/50 text-amber-300 bg-amber-500/5',
  at_risk: 'border-yellow-500/50 text-yellow-300 bg-yellow-500/5',
  open_dependency: 'border-accent/50 text-text-primary bg-accent/5',
};

/**
 * Client-side free-text search over a blocker's title, project name, and
 * reason. Pure + exported so the search behavior is unit-testable.
 */
export function matchesBlockerSearch(item: BlockerItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    item.projectName.toLowerCase().includes(q) ||
    (item.reason ?? '').toLowerCase().includes(q)
  );
}

interface Props {
  initial?: BlockerItem[];
}

export function BlockersList({ initial = [] }: Props) {
  const [items, setItems] = useState<BlockerItem[]>(initial);
  const [loaded, setLoaded] = useState(initial.length > 0);
  const [kindFilter, setKindFilter] = useState<BlockerItemKind | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<BlockerSeverity | 'all'>('all');
  const [search, setSearch] = useState('');

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
          (severityFilter === 'all' || i.severity === severityFilter) &&
          matchesBlockerSearch(i, search),
      ),
    [items, kindFilter, severityFilter, search],
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

  const filters = useMemo<MakerQuery>(
    () => ({ kind: kindFilter, severity: severityFilter }),
    [kindFilter, severityFilter],
  );

  function applyQuery(q: MakerQuery) {
    setKindFilter((q.kind as BlockerItemKind | 'all') || 'all');
    setSeverityFilter((q.severity as BlockerSeverity | 'all') || 'all');
    setSearch(q.search ?? '');
  }

  return (
    <div className="space-y-4">
      {/* Search + saved views + the kind / severity chip rows */}
      <MakerListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search blockers by title, project, or reason"
        filters={filters}
        onApplyQuery={applyQuery}
        savedViewKey="blockers"
        filterControls={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-text-secondary">
                Kind
              </span>
              <KindFilterChips<BlockerItemKind>
                value={kindFilter === 'all' ? null : kindFilter}
                onChange={(next) => setKindFilter(next ?? 'all')}
                options={BLOCKER_ITEM_KINDS.map((k) => ({
                  value: k,
                  label: k === 'milestone' ? 'Milestone' : 'Dependency',
                }))}
                testIdPrefix="blockers-list-kind"
                ariaLabel="Filter blockers by kind"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-text-secondary">
                Severity
              </span>
              <KindFilterChips<BlockerSeverity>
                value={severityFilter === 'all' ? null : severityFilter}
                onChange={(next) => setSeverityFilter(next ?? 'all')}
                options={BLOCKER_SEVERITIES.map((s) => ({
                  value: s,
                  label: BLOCKER_SEVERITY_LABELS[s],
                }))}
                testIdPrefix="blockers-list-severity"
                ariaLabel="Filter blockers by severity"
              />
            </div>
          </div>
        }
      />

      {!loaded && <p className="text-xs text-text-secondary">Loading…</p>}
      {loaded && grouped.length === 0 && (
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title={items.length === 0 ? 'All clear' : 'No blockers match'}
          description={
            items.length === 0
              ? 'No active blockers across your Maker projects — no missed, blocked, overdue, or at-risk milestones and no open dependency edges.'
              : 'Try clearing the search or adjusting the kind and severity filters.'
          }
        />
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

