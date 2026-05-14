'use client';

/**
 * Week-view activity plan calendar.
 *
 * Shape differs from the meal-plan calendar (5b): activity plans have one
 * cell per day with potentially multiple slots stacked, rather than a 4
 * meal-slot grid. Kept separate from meal-plan-calendar because the
 * underlying shape is genuinely different — refactoring a shared
 * <WeekCalendar> would have introduced more abstraction than it saved.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
  Trash2,
  X,
  Dumbbell,
} from 'lucide-react';

type Intensity = 'light' | 'moderate' | 'vigorous';

interface PlanSlot {
  id: string;
  dayOfWeek: number;
  templateId: string | null;
  template?: {
    id: string;
    name: string;
    category: string;
    targetIntensity: Intensity;
    estDurationMin: number;
  } | null;
  freeformText: string | null;
  targetDurationMin: number | null;
  targetIntensity: Intensity | null;
  notes: string | null;
  position: number;
}

interface Plan {
  id: string;
  weekStartDate: string;
  name: string | null;
  notes: string | null;
  slots: PlanSlot[];
}

interface TemplateLite {
  id: string;
  name: string;
  category: string;
  source: 'system' | 'custom';
  estDurationMin: number;
  targetIntensity: Intensity;
}

export interface ActivityPlanCalendarProps {
  initialWeekStart: string;
  initialPlan: Plan | null;
  templates: TemplateLite[];
}

const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const INTENSITY_COLOR: Record<Intensity, string> = {
  light: 'text-emerald-300',
  moderate: 'text-accent',
  vigorous: 'text-amber-300',
};

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function mondayOfClient(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function ActivityPlanCalendar({
  initialWeekStart,
  initialPlan,
  templates,
}: ActivityPlanCalendarProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [plan, setPlan] = useState<Plan | null>(initialPlan);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{
    dayOfWeek: number;
    editing: PlanSlot | null;
  } | null>(null);
  const [logged, setLogged] = useState<Set<string>>(new Set());

  const today = todayUtc();
  const todayDow = useMemo(() => {
    const t = new Date(today + 'T00:00:00Z');
    const ws = new Date(weekStart + 'T00:00:00Z');
    const diff = Math.round(
      (t.getTime() - ws.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diff >= 0 && diff <= 6 ? diff : null;
  }, [weekStart, today]);

  const refresh = useCallback(async (ws: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/health/activity-plans?week=${ws}`,
        { cache: 'no-store' },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Failed to load plan');
      setPlan(j.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (weekStart !== initialWeekStart) void refresh(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const ensurePlan = useCallback(async (): Promise<Plan | null> => {
    if (plan) return plan;
    const r = await fetch(`/api/tiresias/agentic-os/health/activity-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekStartDate: weekStart }),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error ?? 'Failed to create plan');
      return null;
    }
    setPlan(j.plan);
    return j.plan as Plan;
  }, [plan, weekStart]);

  const onSlotSaved = (saved: PlanSlot) => {
    setPlan((prev) => {
      if (!prev) return prev;
      const exists = prev.slots.find((s) => s.id === saved.id);
      const slots = exists
        ? prev.slots.map((s) => (s.id === saved.id ? saved : s))
        : [...prev.slots, saved];
      return { ...prev, slots };
    });
  };

  const deleteSlot = async (slot: PlanSlot) => {
    if (!plan) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/health/activity-plans/${plan.id}/slots/${slot.id}`,
      { method: 'DELETE' },
    );
    if (r.ok) {
      setPlan((prev) =>
        prev ? { ...prev, slots: prev.slots.filter((s) => s.id !== slot.id) } : prev,
      );
    }
  };

  const moveSlot = async (slot: PlanSlot, dir: -1 | 1) => {
    if (!plan) return;
    const peers = plan.slots
      .filter((s) => s.dayOfWeek === slot.dayOfWeek)
      .sort((a, b) => a.position - b.position);
    const idx = peers.findIndex((p) => p.id === slot.id);
    const target = idx + dir;
    if (target < 0 || target >= peers.length) return;
    const other = peers[target];
    await Promise.all([
      fetch(
        `/api/tiresias/agentic-os/health/activity-plans/${plan.id}/slots/${slot.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: other.position }),
        },
      ),
      fetch(
        `/api/tiresias/agentic-os/health/activity-plans/${plan.id}/slots/${other.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: slot.position }),
        },
      ),
    ]);
    await refresh(weekStart);
  };

  const logSlot = async (slot: PlanSlot) => {
    if (!plan) return;
    const date = addDaysISO(weekStart, slot.dayOfWeek);
    const r = await fetch(
      `/api/tiresias/agentic-os/health/activity-plans/${plan.id}/slots/${slot.id}/log?date=${date}`,
      { method: 'POST' },
    );
    if (r.ok) {
      setLogged((s) => new Set(s).add(slot.id));
    }
  };

  const copyWeek = async () => {
    if (!plan) return;
    const nextWeek = addDaysISO(weekStart, 7);
    setLoading(true);
    setError(null);
    try {
      const createR = await fetch(
        `/api/tiresias/agentic-os/health/activity-plans`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weekStartDate: nextWeek }),
        },
      );
      const createJ = await createR.json();
      if (!createR.ok) throw new Error(createJ.error ?? 'Create failed');
      const target = createJ.plan as Plan;
      for (const s of plan.slots) {
        await fetch(
          `/api/tiresias/agentic-os/health/activity-plans/${target.id}/slots`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dayOfWeek: s.dayOfWeek,
              templateId: s.templateId,
              freeformText: s.freeformText,
              targetDurationMin: s.targetDurationMin,
              targetIntensity: s.targetIntensity,
              notes: s.notes,
            }),
          },
        );
      }
      setWeekStart(nextWeek);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Copy week failed');
    } finally {
      setLoading(false);
    }
  };

  const slotsByDay = useMemo(() => {
    const m: Record<number, PlanSlot[]> = {};
    for (const s of plan?.slots ?? []) {
      (m[s.dayOfWeek] = m[s.dayOfWeek] ?? []).push(s);
    }
    for (const k of Object.keys(m)) {
      m[Number(k)].sort((a, b) => a.position - b.position);
    }
    return m;
  }, [plan]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
            className="rounded-lg border border-border-subtle bg-surface-0 p-2 text-text-primary hover:border-accent/50 hover:text-white"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(mondayOfClient(todayUtc()))}
            className="rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-xs text-text-primary hover:border-accent/50 hover:text-white"
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
            className="rounded-lg border border-border-subtle bg-surface-0 p-2 text-text-primary hover:border-accent/50 hover:text-white"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-sm text-text-primary">
            Week of {weekStart}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {plan && plan.slots.length > 0 && (
            <button
              type="button"
              onClick={copyWeek}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-xs text-text-primary hover:border-accent/50 hover:text-white"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy week →
            </button>
          )}
          {loading && <span className="text-xs text-text-secondary">Loading…</span>}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
        {DAY_LABEL.map((label, day) => {
          const items = slotsByDay[day] ?? [];
          const isToday = todayDow === day;
          return (
            <div
              key={label}
              className={`rounded-lg border p-2 min-h-[160px] ${
                isToday
                  ? 'border-accent/40 bg-accent/5'
                  : 'border-border-subtle bg-surface-2'
              }`}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span
                  className={`text-xs ${
                    isToday ? 'text-white' : 'text-text-primary'
                  }`}
                >
                  {label}
                </span>
                <span className="text-[10px] text-[#64748b]">
                  {addDaysISO(weekStart, day).slice(5)}
                </span>
              </div>
              <div className="space-y-1.5">
                {items.map((s, i) => (
                  <SlotCard
                    key={s.id}
                    slot={s}
                    canMoveUp={i > 0}
                    canMoveDown={i < items.length - 1}
                    logged={logged.has(s.id)}
                    canLogToday={isToday}
                    onEdit={() => setDrawer({ dayOfWeek: day, editing: s })}
                    onDelete={() => deleteSlot(s)}
                    onMoveUp={() => moveSlot(s, -1)}
                    onMoveDown={() => moveSlot(s, 1)}
                    onLog={() => logSlot(s)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setDrawer({ dayOfWeek: day, editing: null })}
                  className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-border-subtle py-1 text-[10px] text-text-secondary hover:border-accent/50 hover:text-white"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {drawer && (
        <SlotDrawer
          dayOfWeek={drawer.dayOfWeek}
          editing={drawer.editing}
          templates={templates}
          ensurePlan={ensurePlan}
          onClose={() => setDrawer(null)}
          onSaved={async (s) => {
            onSlotSaved(s);
            setDrawer(null);
          }}
        />
      )}
    </div>
  );
}

function SlotCard({
  slot,
  canMoveUp,
  canMoveDown,
  logged,
  canLogToday,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onLog,
}: {
  slot: PlanSlot;
  canMoveUp: boolean;
  canMoveDown: boolean;
  logged: boolean;
  canLogToday: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onLog: () => void;
}) {
  const label = slot.template?.name ?? slot.freeformText ?? '—';
  const duration =
    slot.targetDurationMin ?? slot.template?.estDurationMin ?? null;
  const intensity = slot.targetIntensity ?? slot.template?.targetIntensity ?? null;
  return (
    <div className="rounded border border-border-subtle bg-surface-0 p-1.5">
      <button type="button" onClick={onEdit} className="block w-full text-left">
        <div className="flex items-center gap-1 text-[11px] text-white truncate">
          {slot.template && (
            <Dumbbell className="h-3 w-3 shrink-0 text-accent" />
          )}
          <span className="truncate">{label}</span>
        </div>
        <div className="text-[9px] text-text-secondary">
          {duration !== null ? `${duration}m` : ''}
          {duration !== null && intensity ? ' · ' : ''}
          {intensity ? (
            <span className={INTENSITY_COLOR[intensity]}>{intensity}</span>
          ) : null}
        </div>
      </button>
      <div className="mt-1 flex items-center justify-between gap-0.5">
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="rounded p-0.5 text-text-secondary hover:text-white disabled:opacity-30"
            aria-label="Move up"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="rounded p-0.5 text-text-secondary hover:text-white disabled:opacity-30"
            aria-label="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
        <div className="flex gap-0.5">
          {canLogToday && (
            <button
              type="button"
              onClick={onLog}
              className={`rounded p-0.5 ${
                logged
                  ? 'text-emerald-400'
                  : 'text-text-secondary hover:text-emerald-400'
              }`}
              aria-label="I did this"
              title="I did this"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-0.5 text-text-secondary hover:text-red-300"
            aria-label="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SlotDrawer({
  dayOfWeek,
  editing,
  templates,
  ensurePlan,
  onClose,
  onSaved,
}: {
  dayOfWeek: number;
  editing: PlanSlot | null;
  templates: TemplateLite[];
  ensurePlan: () => Promise<Plan | null>;
  onClose: () => void;
  onSaved: (slot: PlanSlot) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<'template' | 'freeform'>(
    editing?.templateId ? 'template' : 'freeform',
  );
  const [templateId, setTemplateId] = useState<string | null>(
    editing?.templateId ?? null,
  );
  const [freeformText, setFreeformText] = useState(
    editing?.freeformText ?? '',
  );
  const [targetDurationMin, setTargetDurationMin] = useState<string>(
    editing?.targetDurationMin !== null && editing?.targetDurationMin !== undefined
      ? String(editing.targetDurationMin)
      : '',
  );
  const [targetIntensity, setTargetIntensity] = useState<Intensity | ''>(
    editing?.targetIntensity ?? '',
  );
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const plan = await ensurePlan();
      if (!plan) {
        setError('Could not load plan');
        return;
      }
      const body = {
        dayOfWeek,
        templateId: mode === 'template' ? templateId : null,
        freeformText: mode === 'freeform' ? freeformText.trim() || null : null,
        targetDurationMin: targetDurationMin.trim()
          ? Number(targetDurationMin)
          : null,
        targetIntensity: targetIntensity || null,
        notes: notes.trim() || null,
      };
      const url = editing
        ? `/api/tiresias/agentic-os/health/activity-plans/${plan.id}/slots/${editing.id}`
        : `/api/tiresias/agentic-os/health/activity-plans/${plan.id}/slots`;
      const r = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? 'Save failed');
        return;
      }
      await onSaved(j.slot);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl border border-border-subtle bg-surface-2 p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            <Dumbbell className="inline h-4 w-4 mr-1.5 text-accent" />
            {editing ? 'Edit' : 'Plan'} activity — {DAY_LABEL[dayOfWeek]}
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
          <div className="flex gap-1.5">
            {(['template', 'freeform'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  mode === m
                    ? 'bg-accent text-white'
                    : 'border border-border-subtle bg-surface-0 text-text-primary hover:border-accent/50'
                }`}
              >
                {m === 'template' ? 'Workout template' : 'Freeform'}
              </button>
            ))}
          </div>

          {mode === 'template' && (
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">
                Workout
              </span>
              <select
                value={templateId ?? ''}
                onChange={(e) => setTemplateId(e.target.value || null)}
                className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              >
                <option value="">Select a workout…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.category}, {t.estDurationMin}m,{' '}
                    {t.targetIntensity})
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === 'freeform' && (
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">
                Activity
              </span>
              <input
                value={freeformText}
                onChange={(e) => setFreeformText(e.target.value)}
                placeholder={'e.g. "rest day", "PT appointment"'}
                className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-[#64748b] focus:border-accent focus:outline-none"
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">
                Duration (min, override)
              </span>
              <input
                type="number"
                min="1"
                value={targetDurationMin}
                onChange={(e) => setTargetDurationMin(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                placeholder="optional"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">
                Intensity (override)
              </span>
              <select
                value={targetIntensity}
                onChange={(e) =>
                  setTargetIntensity(e.target.value as Intensity | '')
                }
                className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              >
                <option value="">— (use template)</option>
                <option value="light">light</option>
                <option value="moderate">moderate</option>
                <option value="vigorous">vigorous</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-text-secondary">Notes</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-[#64748b] focus:border-accent focus:outline-none"
            />
          </label>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
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
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-[#3a56d4] disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
