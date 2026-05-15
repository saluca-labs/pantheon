'use client';

/**
 * Research OS Phase 6 + Wave D — full workshop blockers list.
 *
 * Wave D specialization: the surface keeps its kind / severity filter
 * chips, and gains `SavedViews` with a built-in **Top blockers** default
 * view (high-severity only) that is applied on first load — the list
 * opens on "what's on fire" instead of the full feed, then the reset pill
 * widens to everything. User-saved views are persisted via the
 * localStorage-mock store (`SavedViews` has no persistence yet — known
 * `_shared/views` gap #2; Wave E schema-backs it).
 *
 * Filter chips for kind (milestone / dependency) + severity (high /
 * medium); groups by experiment for easier scanning.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import {
  EmptyState,
  SavedViews,
  SkeletonGroup,
  Skeleton,
} from '@/components/agentic-os/_shared/views';
import { BlockerRow } from './blocker-row';
import {
  BLOCKER_ITEM_KINDS,
  BLOCKER_SEVERITIES,
  BLOCKER_SEVERITY_LABELS,
  type BlockerItem,
} from '@/lib/agentic-os/research/blockers';
import {
  filterBlockers,
  groupBlockersByExperiment,
  blockerQueryEquals,
  ALL_BLOCKERS_QUERY,
  TOP_BLOCKERS_DEFAULT_VIEW,
  TOP_BLOCKERS_VIEW_ID,
  type BlockerQuery,
} from '@/lib/agentic-os/research/blockers-view';
import { useSavedViews } from '@/lib/agentic-os/research/saved-views-store';

const API_BASE = '/api/tiresias/agentic-os/research';

/** localStorage key for this surface's user-saved views. */
const SAVED_VIEWS_KEY = 'blockers';

interface Props {
  initial?: BlockerItem[];
}

export function TopBlockersList({ initial = [] }: Props) {
  const [items, setItems] = useState<BlockerItem[]>(initial);
  const [loaded, setLoaded] = useState(initial.length > 0);

  // Open on the built-in "Top blockers" default view (high-severity only).
  const [query, setQuery] = useState<BlockerQuery>(TOP_BLOCKERS_DEFAULT_VIEW.query);
  const [activeViewId, setActiveViewId] = useState<string | null>(
    TOP_BLOCKERS_VIEW_ID,
  );

  // User-saved views — localStorage-mock until Wave E schema-backs SavedViews.
  // The built-in "Top blockers" view is prepended so it's always available.
  const { views: userViews, saveView, deleteView } =
    useSavedViews<BlockerQuery>(SAVED_VIEWS_KEY);
  const allViews = useMemo(
    () => [TOP_BLOCKERS_DEFAULT_VIEW, ...userViews],
    [userViews],
  );

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

  const filtered = useMemo(() => filterBlockers(items, query), [items, query]);
  const grouped = useMemo(
    () => groupBlockersByExperiment(filtered),
    [filtered],
  );

  // "Dirty" when the live query no longer matches the active view's query.
  const activeView = allViews.find((v) => v.id === activeViewId) ?? null;
  const isDirty =
    activeView != null && !blockerQueryEquals(activeView.query, query);

  function patchQuery(patch: Partial<BlockerQuery>) {
    setQuery((prev) => ({ ...prev, ...patch }));
    setActiveViewId(null);
  }

  return (
    <div className="space-y-4" data-testid="top-blockers-list">
      {/* Saved views — built-in "Top blockers" default + user presets. */}
      <SavedViews<BlockerQuery>
        views={allViews}
        activeViewId={activeViewId}
        currentQuery={query}
        isDirty={isDirty}
        slug="research"
        allViewsLabel="All blockers"
        onClearView={() => {
          setQuery(ALL_BLOCKERS_QUERY);
          setActiveViewId(null);
        }}
        onSelectView={(view) => {
          setQuery(view.query);
          setActiveViewId(view.id);
        }}
        onSaveView={(name, q) => {
          const view = saveView(name, q);
          setActiveViewId(view.id);
        }}
        onDeleteView={(id) => {
          // The built-in default is not user-deletable.
          if (id === TOP_BLOCKERS_VIEW_ID) return;
          deleteView(id);
          if (activeViewId === id) setActiveViewId(null);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-text-secondary">Kind</span>
        <Chip
          active={query.kind === 'all'}
          onClick={() => patchQuery({ kind: 'all' })}
          label="All"
          testId="kind-chip-all"
        />
        {BLOCKER_ITEM_KINDS.map((k) => (
          <Chip
            key={k}
            active={query.kind === k}
            onClick={() => patchQuery({ kind: k })}
            label={k === 'milestone' ? 'Milestone' : 'Dependency'}
            testId={`kind-chip-${k}`}
          />
        ))}
        <span className="ml-3 text-[10px] uppercase tracking-wide text-text-secondary">
          Severity
        </span>
        <Chip
          active={query.severity === 'all'}
          onClick={() => patchQuery({ severity: 'all' })}
          label="All"
          testId="severity-chip-all"
        />
        {BLOCKER_SEVERITIES.map((s) => (
          <Chip
            key={s}
            active={query.severity === s}
            onClick={() => patchQuery({ severity: s })}
            label={BLOCKER_SEVERITY_LABELS[s]}
            testId={`severity-chip-${s}`}
          />
        ))}
      </div>

      {!loaded && (
        <SkeletonGroup>
          <Skeleton variant="list-row" />
          <Skeleton variant="list-row" />
          <Skeleton variant="list-row" />
        </SkeletonGroup>
      )}
      {loaded && grouped.length === 0 && (
        <div data-testid="top-blockers-list-empty">
          <EmptyState
            icon={<ShieldAlert className="h-6 w-6" />}
            title="All clear"
            description={
              activeViewId === TOP_BLOCKERS_VIEW_ID
                ? 'No high-severity blockers across your experiments. Switch to "All blockers" to see medium-severity items.'
                : 'No active blockers across your experiments — no overdue milestones, no open blocking dependencies.'
            }
          />
        </div>
      )}

      {grouped.map((group) => (
        <div
          key={group.experimentId}
          className="rounded-xl border border-border-subtle bg-surface-2 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">{group.experimentName}</h3>
            <Link
              href={`/dashboard/os/research/experiments/${group.experimentId}`}
              className="text-[10px] uppercase tracking-wide text-accent hover:underline"
            >
              Open experiment
            </Link>
          </div>
          <ul className="space-y-2">
            {group.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <BlockerRow item={item} />
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
  testId,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
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
