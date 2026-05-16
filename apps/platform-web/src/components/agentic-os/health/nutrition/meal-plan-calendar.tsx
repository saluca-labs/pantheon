'use client';

/**
 * Week-view meal plan calendar.
 *
 * Server provides ``initialWeekStart`` (Monday). Client owns navigation
 * and refetches. Each cell shows planned items + an "Add" button + an
 * "I ate this" button per slot (per-day check). Reorder is via the slot's
 * move-up / move-down arrows; cross-cell moves use the slot editor.
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
  Utensils,
  X,
} from 'lucide-react';
import {
  FoodCombobox,
  type FoodPickerItem,
} from '@/components/agentic-os/health/nutrition/food-combobox';
import { Spinner } from '@/components/agentic-os/_shared/views';

type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};
const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface PlanSlot {
  id: string;
  dayOfWeek: number;
  mealSlot: MealSlot;
  recipeId: string | null;
  recipe?: { id: string; name: string } | null;
  foodItemId: string | null;
  foodItem?: { id: string; name: string; brand: string | null } | null;
  freeformText: string | null;
  servings: number;
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

interface RecipeLite {
  id: string;
  name: string;
}

export interface MealPlanCalendarProps {
  initialWeekStart: string;
  initialPlan: Plan | null;
  recipes: RecipeLite[];
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MealPlanCalendar({
  initialWeekStart,
  initialPlan,
  recipes,
}: MealPlanCalendarProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [plan, setPlan] = useState<Plan | null>(initialPlan);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{
    dayOfWeek: number;
    mealSlot: MealSlot;
    editing: PlanSlot | null;
  } | null>(null);
  const [loggedToday, setLoggedToday] = useState<Set<string>>(new Set());

  const today = todayUtc();
  const todayDow = useMemo(() => {
    const t = new Date(today + 'T00:00:00Z');
    const ws = new Date(weekStart + 'T00:00:00Z');
    const diff = Math.round(
      (t.getTime() - ws.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diff >= 0 && diff <= 6 ? diff : null;
  }, [weekStart, today]);

  const refresh = useCallback(
    async (ws: string) => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/tiresias/agentic-os/health/meal-plans?week=${ws}`,
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
    },
    [],
  );

  useEffect(() => {
    if (weekStart !== initialWeekStart) void refresh(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  // Lazy-create the plan on first slot add.
  const ensurePlan = useCallback(async (): Promise<Plan | null> => {
    if (plan) return plan;
    const r = await fetch(`/api/tiresias/agentic-os/health/meal-plans`, {
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

  const onSlotSaved = async (saved: PlanSlot) => {
    setPlan((prev) => {
      if (!prev) return prev;
      const exists = prev.slots.find((s) => s.id === saved.id);
      const slots = exists
        ? prev.slots.map((s) => (s.id === saved.id ? saved : s))
        : [...prev.slots, saved];
      return { ...prev, slots };
    });
  };

  const onSlotDeleted = (id: string) => {
    setPlan((prev) =>
      prev ? { ...prev, slots: prev.slots.filter((s) => s.id !== id) } : prev,
    );
  };

  const deleteSlot = async (slot: PlanSlot) => {
    if (!plan) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/health/meal-plans/${plan.id}/slots/${slot.id}`,
      { method: 'DELETE' },
    );
    if (r.ok) onSlotDeleted(slot.id);
  };

  const moveSlot = async (slot: PlanSlot, dir: -1 | 1) => {
    if (!plan) return;
    const peers = plan.slots
      .filter(
        (s) =>
          s.dayOfWeek === slot.dayOfWeek && s.mealSlot === slot.mealSlot,
      )
      .sort((a, b) => a.position - b.position);
    const idx = peers.findIndex((p) => p.id === slot.id);
    const target = idx + dir;
    if (target < 0 || target >= peers.length) return;
    const other = peers[target];
    await Promise.all([
      fetch(
        `/api/tiresias/agentic-os/health/meal-plans/${plan.id}/slots/${slot.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: other.position }),
        },
      ),
      fetch(
        `/api/tiresias/agentic-os/health/meal-plans/${plan.id}/slots/${other.id}`,
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
      `/api/tiresias/agentic-os/health/meal-plans/${plan.id}/slots/${slot.id}/log?date=${date}`,
      { method: 'POST' },
    );
    if (r.ok) {
      setLoggedToday((s) => new Set(s).add(slot.id));
    }
  };

  const copyWeek = async () => {
    if (!plan) return;
    const nextWeek = addDaysISO(weekStart, 7);
    setLoading(true);
    setError(null);
    try {
      // Lazy-create / ensure target plan exists.
      const createR = await fetch(`/api/tiresias/agentic-os/health/meal-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStartDate: nextWeek }),
      });
      const createJ = await createR.json();
      if (!createR.ok) throw new Error(createJ.error ?? 'Create failed');
      const target = createJ.plan as Plan;
      for (const s of plan.slots) {
        await fetch(
          `/api/tiresias/agentic-os/health/meal-plans/${target.id}/slots`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dayOfWeek: s.dayOfWeek,
              mealSlot: s.mealSlot,
              recipeId: s.recipeId,
              foodItemId: s.foodItemId,
              freeformText: s.freeformText,
              servings: s.servings,
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

  const slotsByCell = useMemo(() => {
    const m: Record<string, PlanSlot[]> = {};
    for (const s of plan?.slots ?? []) {
      const key = `${s.dayOfWeek}:${s.mealSlot}`;
      (m[key] = m[key] ?? []).push(s);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.position - b.position);
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
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
              <Spinner size="xs" />
              Loading…
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-24 text-left text-xs text-text-secondary font-normal pl-2"></th>
              {DAY_LABEL.map((d, i) => (
                <th
                  key={d}
                  className={`text-left text-xs px-2 py-1 ${
                    todayDow === i ? 'text-white' : 'text-text-secondary'
                  }`}
                >
                  <div>{d}</div>
                  <div className="text-[10px] text-text-tertiary">
                    {addDaysISO(weekStart, i).slice(5)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => (
              <tr key={slot}>
                <td className="align-top text-xs text-text-primary font-medium pl-2 pt-2">
                  {SLOT_LABEL[slot]}
                </td>
                {DAY_LABEL.map((_, day) => {
                  const items = slotsByCell[`${day}:${slot}`] ?? [];
                  const isToday = todayDow === day;
                  return (
                    <td
                      key={day}
                      className={`align-top rounded-lg border p-1.5 min-w-[110px] ${
                        isToday
                          ? 'border-accent/40 bg-accent/5'
                          : 'border-border-subtle bg-surface-2'
                      }`}
                    >
                      <div className="space-y-1.5">
                        {items.map((s, i) => (
                          <CellItem
                            key={s.id}
                            slot={s}
                            canMoveUp={i > 0}
                            canMoveDown={i < items.length - 1}
                            logged={loggedToday.has(s.id)}
                            isToday={isToday}
                            onEdit={() =>
                              setDrawer({
                                dayOfWeek: day,
                                mealSlot: slot,
                                editing: s,
                              })
                            }
                            onDelete={() => deleteSlot(s)}
                            onMoveUp={() => moveSlot(s, -1)}
                            onMoveDown={() => moveSlot(s, 1)}
                            onLog={() => logSlot(s)}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setDrawer({
                              dayOfWeek: day,
                              mealSlot: slot,
                              editing: null,
                            })
                          }
                          className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-border-subtle py-1 text-[10px] text-text-secondary hover:border-accent/50 hover:text-white"
                        >
                          <Plus className="h-3 w-3" /> Add
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drawer && (
        <SlotDrawer
          dayOfWeek={drawer.dayOfWeek}
          mealSlot={drawer.mealSlot}
          editing={drawer.editing}
          recipes={recipes}
          ensurePlan={ensurePlan}
          onClose={() => setDrawer(null)}
          onSaved={async (s) => {
            await onSlotSaved(s);
            setDrawer(null);
          }}
        />
      )}
    </div>
  );
}

function mondayOfClient(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function CellItem({
  slot,
  canMoveUp,
  canMoveDown,
  logged,
  isToday,
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
  isToday: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onLog: () => void;
}) {
  const label =
    slot.recipe?.name ??
    slot.foodItem?.name ??
    slot.freeformText ??
    '—';
  return (
    <div className="rounded border border-border-subtle bg-surface-0 p-1.5">
      <button
        type="button"
        onClick={onEdit}
        className="block w-full text-left"
      >
        <div className="text-[11px] text-white truncate">{label}</div>
        <div className="text-[9px] text-text-secondary">
          {slot.servings} svg
          {slot.recipe ? ' · recipe' : ''}
          {slot.foodItem ? ' · food' : ''}
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
          {isToday && (
            <button
              type="button"
              onClick={onLog}
              className={`rounded p-0.5 ${
                logged
                  ? 'text-positive'
                  : 'text-text-secondary hover:text-positive'
              }`}
              aria-label="I ate this"
              title="I ate this"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-0.5 text-text-secondary hover:text-danger"
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
  mealSlot,
  editing,
  recipes,
  ensurePlan,
  onClose,
  onSaved,
}: {
  dayOfWeek: number;
  mealSlot: MealSlot;
  editing: PlanSlot | null;
  recipes: RecipeLite[];
  ensurePlan: () => Promise<Plan | null>;
  onClose: () => void;
  onSaved: (slot: PlanSlot) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<'recipe' | 'food' | 'freeform'>(
    editing?.recipeId
      ? 'recipe'
      : editing?.foodItemId
        ? 'food'
        : 'freeform',
  );
  const [recipeId, setRecipeId] = useState<string | null>(
    editing?.recipeId ?? null,
  );
  const [foodQuery, setFoodQuery] = useState(
    editing?.foodItem?.name ?? '',
  );
  const [foodId, setFoodId] = useState<string | null>(
    editing?.foodItemId ?? null,
  );
  const [freeformText, setFreeformText] = useState(
    editing?.freeformText ?? '',
  );
  const [servings, setServings] = useState<number>(editing?.servings ?? 1);
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
        mealSlot,
        recipeId: mode === 'recipe' ? recipeId : null,
        foodItemId: mode === 'food' ? foodId : null,
        freeformText:
          mode === 'freeform'
            ? freeformText.trim() || null
            : mode === 'food' && !foodId
              ? foodQuery.trim() || null
              : null,
        servings: Number(servings) || 1,
        notes: notes.trim() || null,
      };
      const url = editing
        ? `/api/tiresias/agentic-os/health/meal-plans/${plan.id}/slots/${editing.id}`
        : `/api/tiresias/agentic-os/health/meal-plans/${plan.id}/slots`;
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
      role="dialog"
      aria-modal="true"
      aria-label={`${editing ? 'Edit' : 'Plan'} ${SLOT_LABEL[mealSlot].toLowerCase()} for ${DAY_LABEL[dayOfWeek]}`}
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
            <Utensils className="inline h-4 w-4 mr-1.5 text-accent" />
            {editing ? 'Edit' : 'Plan'} {SLOT_LABEL[mealSlot].toLowerCase()} —{' '}
            {DAY_LABEL[dayOfWeek]}
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
            {(['recipe', 'food', 'freeform'] as const).map((m) => (
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
                {m === 'recipe' ? 'Recipe' : m === 'food' ? 'Food' : 'Freeform'}
              </button>
            ))}
          </div>

          {mode === 'recipe' && (
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">Recipe</span>
              <select
                value={recipeId ?? ''}
                onChange={(e) => setRecipeId(e.target.value || null)}
                className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              >
                <option value="">Select a recipe…</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === 'food' && (
            <div>
              <span className="mb-1 block text-xs text-text-secondary">Food</span>
              <FoodCombobox
                value={foodQuery}
                onChange={setFoodQuery}
                onSelect={(it: FoodPickerItem | null) => {
                  setFoodId(it?.id ?? null);
                  if (it?.name) setFoodQuery(it.name);
                }}
                selectedId={foodId}
              />
            </div>
          )}

          {mode === 'freeform' && (
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">
                Freeform note
              </span>
              <input
                value={freeformText}
                onChange={(e) => setFreeformText(e.target.value)}
                placeholder={'e.g. "leftovers", "eat out"'}
                className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">
                Servings
              </span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={String(servings)}
                onChange={(e) => setServings(Number(e.target.value) || 1)}
                className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-text-secondary">Notes</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            />
          </label>

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
