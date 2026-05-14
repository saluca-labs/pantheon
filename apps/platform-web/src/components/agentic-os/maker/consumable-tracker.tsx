'use client';

/**
 * Maker OS — ConsumableTracker.
 *
 * Per-tool table of consumables (bits, blades, filters, etc.) with a one-click
 * "replace" button that resets hours_remaining to max_hours.
 *
 * Wave C kept the consumable row as a thin flat progress bar.
 *
 * Wave D.4 — consumable wear gauges (no API / query changes; consumes the
 * existing `percentRemaining` / `consumableStatus` pure helpers):
 *  - The thin flat bar is replaced by a proper `WearGauge` — a segmented
 *    life-remaining gauge with a bold percentage read-out, status-tinted
 *    fill, and a "low" / "exhausted" threshold tick so the maker sees how
 *    close to replacement a consumable is at a glance.
 *  - Untracked consumables (no hours data) get an explicit "untracked"
 *    gauge state instead of silently rendering nothing.
 *  - A header strip rolls up how many consumables are low / exhausted so
 *    the section reads as a maintenance dashboard, not just a list.
 *  - Row layout, add form, replace + delete flows are unchanged.
 *
 * @license MIT — Tiresias Maker OS Phase 4 + Wave D.4 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle, CircleAlert } from 'lucide-react';
import {
  CONSUMABLE_KIND_VALUES,
  CONSUMABLE_KIND_LABELS,
  consumableStatus,
  formatHours,
  percentRemaining,
  sortConsumables,
  type ConsumableKind,
  type ConsumableStatus,
  type ToolConsumable,
} from '@/lib/agentic-os/maker/consumables';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const STATUS_FILL: Record<ConsumableStatus, string> = {
  exhausted: 'bg-red-500',
  low: 'bg-amber-500',
  ok: 'bg-emerald-500',
  unknown: 'bg-border-subtle',
};

const STATUS_LABEL: Record<ConsumableStatus, string> = {
  exhausted: 'Exhausted',
  low: 'Low',
  ok: 'OK',
  unknown: 'Untracked',
};

const STATUS_TEXT: Record<ConsumableStatus, string> = {
  exhausted: 'text-red-300',
  low: 'text-amber-300',
  ok: 'text-emerald-300',
  unknown: 'text-text-secondary',
};

/** How many segments the wear gauge is divided into. */
const GAUGE_SEGMENTS = 10;
/** The low-life threshold (matches `consumableStatus`'s 20% boundary). */
const LOW_THRESHOLD = 0.2;

interface Props {
  toolId: string;
  initialConsumables: ToolConsumable[];
}

/**
 * Segmented wear gauge for one consumable. `pct` is life-remaining in
 * [0, 1], or null when the consumable has no hours data (untracked). The
 * gauge fills left-to-right; a threshold tick marks the "low" boundary.
 */
function WearGauge({
  pct,
  status,
}: {
  pct: number | null;
  status: ConsumableStatus;
}) {
  if (pct == null) {
    return (
      <div
        data-testid="wear-gauge"
        data-state="untracked"
        className="flex items-center gap-2"
      >
        <div className="flex h-2.5 flex-1 gap-0.5">
          {Array.from({ length: GAUGE_SEGMENTS }).map((_, i) => (
            <span
              key={i}
              className="flex-1 rounded-[1px] bg-surface-2"
              aria-hidden="true"
            />
          ))}
        </div>
        <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-text-secondary">
          — —
        </span>
      </div>
    );
  }

  const filledSegments = Math.round(pct * GAUGE_SEGMENTS);
  const lowSegment = Math.round(LOW_THRESHOLD * GAUGE_SEGMENTS);

  return (
    <div
      data-testid="wear-gauge"
      data-state={status}
      className="flex items-center gap-2"
    >
      <div className="relative flex h-2.5 flex-1 gap-0.5">
        {Array.from({ length: GAUGE_SEGMENTS }).map((_, i) => {
          const isFilled = i < filledSegments;
          // The low-threshold tick sits on the boundary segment.
          const isThreshold = i === lowSegment - 1;
          return (
            <span
              key={i}
              className={`relative flex-1 rounded-[1px] transition-colors ${
                isFilled ? STATUS_FILL[status] : 'bg-surface-2'
              }`}
              aria-hidden="true"
            >
              {isThreshold && (
                <span className="absolute -bottom-1 right-0 h-1 w-px bg-text-tertiary" />
              )}
            </span>
          );
        })}
      </div>
      <span
        className={`w-12 shrink-0 text-right text-xs font-semibold tabular-nums ${STATUS_TEXT[status]}`}
      >
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

export function ConsumableTracker({ toolId, initialConsumables }: Props) {
  const [items, setItems] = useState<ToolConsumable[]>(initialConsumables);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    kind: 'bit' as ConsumableKind,
    hoursRemaining: '',
    maxHours: '',
    notes: '',
  });

  const apiBase = `/api/tiresias/agentic-os/maker/tools/${toolId}/consumables`;

  const refresh = useCallback(async () => {
    const r = await fetch(apiBase);
    if (r.ok) {
      const { consumables } = await r.json();
      setItems(consumables ?? []);
    }
  }, [apiBase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setError('Name is required.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const r = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          kind: draft.kind || null,
          hoursRemaining: draft.hoursRemaining ? Number(draft.hoursRemaining) : null,
          maxHours: draft.maxHours ? Number(draft.maxHours) : null,
          notes: draft.notes.trim() || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      setDraft({
        name: '',
        kind: 'bit',
        hoursRemaining: '',
        maxHours: '',
        notes: '',
      });
      setShowAdd(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAdding(false);
    }
  }

  async function replace(c: ToolConsumable) {
    if (c.maxHours == null) return;
    const prev = items;
    setItems((arr) =>
      arr.map((x) =>
        x.id === c.id
          ? { ...x, hoursRemaining: c.maxHours, lastReplacedAt: new Date().toISOString() }
          : x,
      ),
    );
    try {
      const r = await fetch(`${apiBase}/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hoursRemaining: c.maxHours,
          lastReplacedAt: new Date().toISOString(),
        }),
      });
      if (!r.ok) throw new Error(`Replace failed (${r.status})`);
      await refresh();
    } catch (err) {
      setItems(prev);
      setError(err instanceof Error ? err.message : 'Replace failed');
    }
  }

  async function remove(c: ToolConsumable) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    const prev = items;
    setItems((arr) => arr.filter((x) => x.id !== c.id));
    try {
      const r = await fetch(`${apiBase}/${c.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`Delete failed (${r.status})`);
    } catch (err) {
      setItems(prev);
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  const sorted = sortConsumables(items);

  // Header rollup — low / exhausted counts across the tool's consumables.
  const wearStats = useMemo(() => {
    let low = 0;
    let exhausted = 0;
    for (const c of items) {
      const s = consumableStatus(c);
      if (s === 'low') low += 1;
      else if (s === 'exhausted') exhausted += 1;
    }
    return { low, exhausted };
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
            Consumables
          </h3>
          {wearStats.exhausted > 0 && (
            <span
              data-testid="consumable-rollup-exhausted"
              className="inline-flex items-center gap-1 text-[10px] text-red-300"
            >
              <CircleAlert className="h-3 w-3" />
              <span className="tabular-nums">{wearStats.exhausted}</span> exhausted
            </span>
          )}
          {wearStats.low > 0 && (
            <span
              data-testid="consumable-rollup-low"
              className="inline-flex items-center gap-1 text-[10px] text-amber-300"
            >
              <AlertTriangle className="h-3 w-3" />
              <span className="tabular-nums">{wearStats.low}</span> low
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-md border border-accent bg-accent/10 px-2.5 py-1 text-xs text-white hover:bg-accent/20 transition"
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {showAdd && (
        <form
          onSubmit={add}
          className="rounded-lg border border-border-subtle bg-surface-0 p-3 space-y-2"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputCls}
              required
            />
            <select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as ConsumableKind })}
              className={inputCls}
            >
              {CONSUMABLE_KIND_VALUES.map((k) => (
                <option key={k} value={k}>
                  {CONSUMABLE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.1"
                placeholder="Hours left"
                value={draft.hoursRemaining}
                onChange={(e) => setDraft({ ...draft, hoursRemaining: e.target.value })}
                className={inputCls}
              />
              <input
                type="number"
                step="0.1"
                placeholder="Max hours"
                value={draft.maxHours}
                onChange={(e) => setDraft({ ...draft, maxHours: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-50 transition"
          >
            {adding ? 'Adding…' : 'Add consumable'}
          </button>
        </form>
      )}

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-subtle p-4 text-center">
          <p className="text-xs text-text-secondary">
            No consumables tracked yet.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => {
            const pct = percentRemaining(c);
            const status = consumableStatus(c);
            return (
              <div
                key={c.id}
                data-testid={`consumable-row-${c.id}`}
                className="rounded-lg border border-border-subtle bg-surface-0 p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white font-medium">
                      {c.name}
                      {c.kind && (
                        <span className="ml-2 text-[10px] text-text-secondary uppercase tracking-wide">
                          {c.kind}
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] ${STATUS_TEXT[status]}`}>
                      {STATUS_LABEL[status]}
                      {c.hoursRemaining != null && c.maxHours != null && (
                        <span className="ml-1 text-text-secondary">
                          ({formatHours(c.hoursRemaining)} / {formatHours(c.maxHours)} h)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.maxHours != null && (
                      <button
                        type="button"
                        onClick={() => replace(c)}
                        className="rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-[10px] text-text-primary hover:bg-border-subtle inline-flex items-center gap-1 transition"
                        title="Reset hours remaining to max"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Replace
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      className="rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10 inline-flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Wear gauge — segmented life-remaining indicator */}
                <WearGauge pct={pct} status={status} />

                {c.notes && (
                  <p className="text-[10px] text-text-secondary">{c.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
