'use client';

/**
 * Maker OS — ConsumableTracker.
 *
 * Per-tool table of consumables (bits, blades, filters, etc.) with a
 * hours_remaining / max_hours progress bar and a one-click "replace" button
 * that resets hours_remaining to max_hours.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
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

const STATUS_BAR: Record<ConsumableStatus, string> = {
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

interface Props {
  toolId: string;
  initialConsumables: ToolConsumable[];
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
          Consumables
        </h3>
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
                className="rounded-lg border border-border-subtle bg-surface-0 p-3 space-y-2"
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
                {pct != null && (
                  <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className={`h-full ${STATUS_BAR[status]} transition-all`}
                      style={{ width: `${Math.round(pct * 100)}%` }}
                    />
                  </div>
                )}
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
