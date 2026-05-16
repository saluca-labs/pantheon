'use client';

/**
 * Client interactive layer for the activity page. Owns:
 *  - date picker
 *  - daily totals (duration + kcal_burned)
 *  - list of today's activities with edit / delete
 *  - log-activity form (drawer)
 *
 * MET_TABLE keys are surfaced as an activity-type autocomplete; users can
 * still type anything (the BFF falls back to MET=4.0 for unknowns).
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Activity, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  Combobox,
  type ComboboxOption,
} from '@/components/agentic-os/_shared/combobox';

type Intensity = 'light' | 'moderate' | 'vigorous';

interface ActivityEntry {
  id: string;
  entryDate: string;
  activityType: string;
  durationMin: number;
  intensity: Intensity;
  kcalBurned: number | null;
  notes: string | null;
}

interface ActivitySummary {
  date: string;
  duration_min: number;
  kcal_burned: number;
  activity_count: number;
}

export interface ActivityLoggerProps {
  initialDate: string;
  initialEntries: ActivityEntry[];
  initialSummary: ActivitySummary;
  activityTypeSuggestions: string[];
}

interface DrawerState {
  open: boolean;
  editing: ActivityEntry | null;
}

const EMPTY_DRAWER: DrawerState = { open: false, editing: null };

export function ActivityLogger({
  initialDate,
  initialEntries,
  initialSummary,
  activityTypeSuggestions,
}: ActivityLoggerProps) {
  const [date, setDate] = useState(initialDate);
  const [entries, setEntries] = useState<ActivityEntry[]>(initialEntries);
  const [summary, setSummary] = useState<ActivitySummary>(initialSummary);
  const [drawer, setDrawer] = useState<DrawerState>(EMPTY_DRAWER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const [entriesR, summaryR] = await Promise.all([
        fetch(`/api/tiresias/agentic-os/health/activity?from=${d}&to=${d}`, {
          cache: 'no-store',
        }),
        fetch(`/api/tiresias/agentic-os/health/nutrition/summary?date=${d}`, {
          cache: 'no-store',
        }),
      ]);
      const entriesJson = await entriesR.json();
      const summaryJson = await summaryR.json();
      if (!entriesR.ok)
        throw new Error(entriesJson.error ?? 'Failed to load activities');
      if (!summaryR.ok)
        throw new Error(summaryJson.error ?? 'Failed to load summary');
      setEntries(entriesJson.entries ?? []);
      setSummary(summaryJson.activity);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (date !== initialDate) void refresh(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const deleteEntry = async (id: string) => {
    if (!window.confirm('Delete this activity entry?')) return;
    const r = await fetch(`/api/tiresias/agentic-os/health/activity/${id}`, {
      method: 'DELETE',
    });
    if (r.ok) await refresh(date);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border-subtle bg-surface-0 px-2 py-1.5 text-sm text-white focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => setDrawer({ open: true, editing: null })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 transition"
        >
          <Plus className="h-4 w-4" />
          Log activity
        </button>
        {loading && <span className="text-xs text-text-secondary">Refreshing…</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Totals label="duration min" value={summary.duration_min} />
        <Totals label="kcal burned" value={summary.kcal_burned} />
        <Totals label="activities" value={summary.activity_count} />
      </div>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-white">Today's activities</h2>
        </div>
        {entries.length === 0 ? (
          <p className="text-xs text-text-secondary">
            Nothing logged yet. Tap "Log activity" to add one.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle bg-surface-0 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white">
                    {e.activityType}{' '}
                    <span className="text-xs text-text-secondary">
                      · {e.intensity}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {e.durationMin} min
                    {e.kcalBurned !== null
                      ? ` · ${Math.round(e.kcalBurned)} kcal`
                      : ''}
                  </div>
                  {e.notes && (
                    <div className="mt-1 text-xs text-text-primary italic line-clamp-2">
                      {e.notes}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setDrawer({ open: true, editing: e })}
                    className="rounded p-1 text-text-secondary hover:bg-surface-2 hover:text-white"
                    aria-label="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteEntry(e.id)}
                    className="rounded p-1 text-text-secondary hover:bg-danger/15 hover:text-danger"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {drawer.open && (
        <ActivityDrawer
          date={date}
          editing={drawer.editing}
          activityTypeSuggestions={activityTypeSuggestions}
          onClose={() => setDrawer(EMPTY_DRAWER)}
          onSaved={async () => {
            setDrawer(EMPTY_DRAWER);
            await refresh(date);
          }}
        />
      )}
    </div>
  );
}

function Totals({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-3">
      <div className="text-[10px] uppercase tracking-wide text-text-secondary">
        {label}
      </div>
      <div className="text-xl font-semibold text-white tabular-nums">
        {value.toFixed(0)}
      </div>
    </div>
  );
}

interface ActivityOption {
  name: string;
}

function ActivityDrawer({
  date,
  editing,
  activityTypeSuggestions,
  onClose,
  onSaved,
}: {
  date: string;
  editing: ActivityEntry | null;
  activityTypeSuggestions: string[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [activityType, setActivityType] = useState(editing?.activityType ?? '');
  const [duration, setDuration] = useState<string>(
    editing ? String(editing.durationMin) : '30',
  );
  const [intensity, setIntensity] = useState<Intensity>(
    editing?.intensity ?? 'moderate',
  );
  const [kcal, setKcal] = useState<string>(
    editing?.kcalBurned !== null && editing?.kcalBurned !== undefined
      ? String(editing.kcalBurned)
      : '',
  );
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

  const options = useMemo<ComboboxOption<ActivityOption>[]>(() => {
    const q = activityType.trim().toLowerCase();
    return activityTypeSuggestions
      .filter((n) => (q ? n.includes(q) : true))
      .slice(0, 12)
      .map((name) => ({ id: name, label: name, data: { name } }));
  }, [activityType, activityTypeSuggestions]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const body: Record<string, unknown> = {
      entryDate: date,
      activityType: activityType.trim(),
      durationMin: Number(duration),
      intensity,
      notes: notes.trim() || null,
    };
    if (kcal.trim().length > 0) body.kcalBurned = Number(kcal);
    const url = editing
      ? `/api/tiresias/agentic-os/health/activity/${editing.id}`
      : `/api/tiresias/agentic-os/health/activity`;
    const r = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error ?? 'Failed to save');
      setSubmitting(false);
      return;
    }
    await onSaved();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editing ? 'Edit activity' : 'Log activity'}
      className="fixed inset-0 z-30 flex items-end justify-center sm:items-center"
    >
      {/* Backdrop — rendered as a button so keyboard users can dismiss
          via Enter / Space without an inline a11y disable. */}
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />
      <div className="relative w-full max-w-lg rounded-t-2xl border border-border-subtle bg-surface-2 p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            {editing ? 'Edit activity' : 'Log activity'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-secondary hover:bg-surface-0 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <span className="mb-1 block text-xs text-text-secondary" aria-hidden="true">
              Activity type
            </span>
            <Combobox<ActivityOption>
              value={activityType}
              onChange={setActivityType}
              onSelect={(opt) => setActivityType(opt.data.name)}
              options={options}
              placeholder="walk, run, yoga, weights, …"
              ariaLabel="Activity type"
              emptyLabel="Type any activity (unknowns default to MET 4.0)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">
                Duration (min)
              </span>
              <input
                type="number"
                step="1"
                min="1"
                max="1440"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                required
                className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">Intensity</span>
              <select
                value={intensity}
                onChange={(e) => setIntensity(e.target.value as Intensity)}
                className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              >
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="vigorous">Vigorous</option>
              </select>
            </label>
            <label className="block col-span-2">
              <span className="mb-1 block text-xs text-text-secondary">
                kcal burned (override; estimated when blank)
              </span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
                placeholder="Auto-estimated from MET + duration"
                className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          <div>
            <label htmlFor={fid('notes')} className="mb-1 block text-xs text-text-secondary">Notes</label>
            <textarea
              id={fid('notes')}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              placeholder="Optional"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-subtle bg-surface-0 px-4 py-2 text-sm text-text-primary hover:border-accent/50 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
