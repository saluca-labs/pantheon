'use client';

/**
 * Research OS Phase 6 — full workshop blockers list.
 *
 * Filter chips for kind (milestone / dependency) + severity (high /
 * medium). Groups by experiment for easier scanning.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { BlockerRow } from './blocker-row';
import {
  BLOCKER_ITEM_KINDS,
  BLOCKER_SEVERITIES,
  BLOCKER_SEVERITY_LABELS,
  type BlockerItem,
  type BlockerItemKind,
  type BlockerSeverity,
} from '@/lib/agentic-os/research/blockers';

const API_BASE = '/api/tiresias/agentic-os/research';

interface Props {
  initial?: BlockerItem[];
}

export function TopBlockersList({ initial = [] }: Props) {
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

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { experimentId: string; experimentName: string; items: BlockerItem[] }
    >();
    for (const item of filtered) {
      const entry = map.get(item.experimentId);
      if (entry) {
        entry.items.push(item);
      } else {
        map.set(item.experimentId, {
          experimentId: item.experimentId,
          experimentName: item.experimentName,
          items: [item],
        });
      }
    }
    return Array.from(map.values());
  }, [filtered]);

  return (
    <div className="space-y-4" data-testid="top-blockers-list">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-text-secondary">Kind</span>
        <Chip
          active={kindFilter === 'all'}
          onClick={() => setKindFilter('all')}
          label="All"
          testId="kind-chip-all"
        />
        {BLOCKER_ITEM_KINDS.map((k) => (
          <Chip
            key={k}
            active={kindFilter === k}
            onClick={() => setKindFilter(k)}
            label={k === 'milestone' ? 'Milestone' : 'Dependency'}
            testId={`kind-chip-${k}`}
          />
        ))}
        <span className="ml-3 text-[10px] uppercase tracking-wide text-text-secondary">
          Severity
        </span>
        <Chip
          active={severityFilter === 'all'}
          onClick={() => setSeverityFilter('all')}
          label="All"
          testId="severity-chip-all"
        />
        {BLOCKER_SEVERITIES.map((s) => (
          <Chip
            key={s}
            active={severityFilter === s}
            onClick={() => setSeverityFilter(s)}
            label={BLOCKER_SEVERITY_LABELS[s]}
            testId={`severity-chip-${s}`}
          />
        ))}
      </div>

      {!loaded && <p className="text-xs text-text-secondary">Loading…</p>}
      {loaded && grouped.length === 0 && (
        <div
          className="rounded-lg border border-dashed border-border-subtle bg-surface-2/30 p-8 text-center"
          data-testid="top-blockers-list-empty"
        >
          <ShieldAlert className="w-6 h-6 text-accent mx-auto mb-2" />
          <p className="text-sm text-white">All clear.</p>
          <p className="text-xs text-text-secondary mt-1">
            No active blockers across your experiments.
          </p>
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
