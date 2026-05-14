'use client';

/**
 * Maker OS — MaintenanceLog.
 *
 * Per-tool maintenance event log with a compose form for new events
 * (event_kind picker, cost, vendor, next_due_at, notes) and a chronological
 * feed of past events newest-first.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import { Trash2, Calendar, Wrench, AlertCircle } from 'lucide-react';
import {
  MAINTENANCE_EVENT_KIND_VALUES,
  MAINTENANCE_EVENT_KIND_LABELS,
  daysUntilNextDue,
  formatCost,
  summarizeMaintenance,
  type MaintenanceEvent,
  type MaintenanceEventKind,
} from '@/lib/agentic-os/maker/maintenance';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

interface Props {
  toolId: string;
  initialEvents: MaintenanceEvent[];
}

function toDatetimeLocal(date: Date): string {
  // YYYY-MM-DDTHH:MM in local timezone — used as the default value for
  // datetime-local inputs.
  const off = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - off).toISOString().slice(0, 16);
}

function dateForDatetimeLocal(value: string): string {
  // Convert datetime-local (no TZ) to an ISO string with local TZ offset.
  return new Date(value).toISOString();
}

export function MaintenanceLog({ toolId, initialEvents }: Props) {
  const [events, setEvents] = useState<MaintenanceEvent[]>(initialEvents);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    eventKind: 'cleaned' as MaintenanceEventKind,
    performedAt: toDatetimeLocal(new Date()),
    costCents: '',
    vendor: '',
    notes: '',
    nextDueAt: '',
  });

  const apiBase = `/api/tiresias/agentic-os/maker/tools/${toolId}/maintenance`;

  const refresh = useCallback(async () => {
    const r = await fetch(apiBase);
    if (r.ok) {
      const { events: latest } = await r.json();
      setEvents(latest ?? []);
    }
  }, [apiBase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const r = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventKind: draft.eventKind,
          performedAt: draft.performedAt
            ? dateForDatetimeLocal(draft.performedAt)
            : undefined,
          costCents: draft.costCents
            ? Math.round(Number(draft.costCents) * 100)
            : null,
          vendor: draft.vendor.trim() || null,
          notes: draft.notes.trim() || null,
          nextDueAt: draft.nextDueAt ? dateForDatetimeLocal(draft.nextDueAt) : null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      setDraft({
        eventKind: 'cleaned',
        performedAt: toDatetimeLocal(new Date()),
        costCents: '',
        vendor: '',
        notes: '',
        nextDueAt: '',
      });
      setShowAdd(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAdding(false);
    }
  }

  async function remove(ev: MaintenanceEvent) {
    if (!confirm('Delete this maintenance event?')) return;
    const prev = events;
    setEvents((arr) => arr.filter((x) => x.id !== ev.id));
    try {
      const r = await fetch(`${apiBase}/${ev.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`Delete failed (${r.status})`);
    } catch (err) {
      setEvents(prev);
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  const stats = summarizeMaintenance(events);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
          Maintenance log
        </h3>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-md border border-accent bg-accent/10 px-2.5 py-1 text-xs text-white hover:bg-accent/20 transition"
        >
          {showAdd ? 'Cancel' : '+ Log event'}
        </button>
      </div>

      {/* Stats strip */}
      {events.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-secondary">
          <span>
            <strong className="text-white">{stats.total}</strong> event
            {stats.total === 1 ? '' : 's'}
          </span>
          {stats.totalCostCents > 0 && (
            <>
              <span>·</span>
              <span>
                Total cost:{' '}
                <strong className="text-white">
                  {formatCost(stats.totalCostCents, stats.currency)}
                </strong>
              </span>
            </>
          )}
          {stats.lastPerformedAt && (
            <>
              <span>·</span>
              <span>
                Last:{' '}
                <strong className="text-white">
                  {new Date(stats.lastPerformedAt).toLocaleDateString()}
                </strong>
              </span>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {showAdd && (
        <form
          onSubmit={add}
          className="rounded-lg border border-border-subtle bg-surface-0 p-3 space-y-2"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={draft.eventKind}
              onChange={(e) =>
                setDraft({ ...draft, eventKind: e.target.value as MaintenanceEventKind })
              }
              className={inputCls}
            >
              {MAINTENANCE_EVENT_KIND_VALUES.map((k) => (
                <option key={k} value={k}>
                  {MAINTENANCE_EVENT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={draft.performedAt}
              onChange={(e) => setDraft({ ...draft, performedAt: e.target.value })}
              className={inputCls}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Cost (USD)"
              value={draft.costCents}
              onChange={(e) => setDraft({ ...draft, costCents: e.target.value })}
              className={inputCls}
            />
            <input
              type="text"
              placeholder="Vendor"
              value={draft.vendor}
              onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
              className={inputCls}
            />
            <input
              type="datetime-local"
              placeholder="Next due"
              value={draft.nextDueAt}
              onChange={(e) => setDraft({ ...draft, nextDueAt: e.target.value })}
              className={`${inputCls} sm:col-span-2`}
              title="Next due"
            />
            <textarea
              placeholder="Notes"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={2}
              className={`${inputCls} sm:col-span-2`}
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-50 transition"
          >
            {adding ? 'Logging…' : 'Log event'}
          </button>
        </form>
      )}

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-subtle p-4 text-center">
          <p className="text-xs text-text-secondary">
            No maintenance events logged yet. Note when the tool is cleaned, serviced,
            calibrated, repaired, or inspected.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => {
            const daysOut = daysUntilNextDue(ev);
            return (
              <div
                key={ev.id}
                className="rounded-lg border border-border-subtle bg-surface-0 p-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Wrench className="w-3.5 h-3.5 text-accent" />
                      <span className="text-sm font-medium text-white">
                        {MAINTENANCE_EVENT_KIND_LABELS[ev.eventKind]}
                      </span>
                      <span className="text-[10px] text-text-secondary">
                        {new Date(ev.performedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-secondary flex flex-wrap gap-x-3 gap-y-0.5">
                      {ev.vendor && <span>Vendor: {ev.vendor}</span>}
                      {ev.costCents != null && (
                        <span>Cost: {formatCost(ev.costCents, ev.currency)}</span>
                      )}
                      {ev.nextDueAt && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Next due {new Date(ev.nextDueAt).toLocaleDateString()}
                          {daysOut != null && (
                            <span
                              className={`ml-1 ${
                                daysOut < 0
                                  ? 'text-red-300'
                                  : daysOut <= 7
                                    ? 'text-amber-300'
                                    : 'text-text-primary'
                              }`}
                            >
                              {daysOut < 0
                                ? `(${Math.abs(daysOut)}d overdue)`
                                : `(in ${daysOut}d)`}
                              {daysOut < 0 && (
                                <AlertCircle className="inline w-3 h-3 ml-0.5" />
                              )}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    {ev.notes && (
                      <p className="text-[12px] text-text-primary whitespace-pre-wrap">
                        {ev.notes}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(ev)}
                    className="rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10 inline-flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
