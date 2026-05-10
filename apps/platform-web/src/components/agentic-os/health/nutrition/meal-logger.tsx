'use client';

/**
 * Client interactive layer for the nutrition page. Owns:
 *  - date picker
 *  - daily totals
 *  - per-meal-slot cards with their entry lists
 *  - the meal-entry drawer (food search OR freeform)
 *  - inline edit / delete
 *
 * The server passes the initial entries + summary in. The client refetches
 * via the BFF on date change and after every mutation.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Utensils, X } from 'lucide-react';
import {
  FoodCombobox,
  type FoodPickerItem,
} from '@/components/agentic-os/health/nutrition/food-combobox';

type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

interface MealEntry {
  id: string;
  entryDate: string;
  mealSlot: MealSlot;
  foodItemId: string | null;
  foodItem?: FoodItem | null;
  freeformDescription: string | null;
  servings: number;
  kcalOverride: number | null;
  proteinGOverride: number | null;
  carbsGOverride: number | null;
  fatGOverride: number | null;
  notes: string | null;
  nutrients: {
    kcal: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };
}

interface NutritionSummary {
  date: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_count: number;
}

export interface MealLoggerProps {
  initialDate: string;
  initialEntries: MealEntry[];
  initialSummary: NutritionSummary;
}

interface DrawerState {
  open: boolean;
  slot: MealSlot;
  editing: MealEntry | null;
}

const EMPTY_DRAWER: DrawerState = { open: false, slot: 'breakfast', editing: null };

export function MealLogger({
  initialDate,
  initialEntries,
  initialSummary,
}: MealLoggerProps) {
  const [date, setDate] = useState(initialDate);
  const [entries, setEntries] = useState<MealEntry[]>(initialEntries);
  const [summary, setSummary] = useState<NutritionSummary>(initialSummary);
  const [drawer, setDrawer] = useState<DrawerState>(EMPTY_DRAWER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (d: string) => {
      setLoading(true);
      setError(null);
      try {
        const [entriesR, summaryR] = await Promise.all([
          fetch(`/api/tiresias/agentic-os/health/meals?from=${d}&to=${d}`, {
            cache: 'no-store',
          }),
          fetch(`/api/tiresias/agentic-os/health/nutrition/summary?date=${d}`, {
            cache: 'no-store',
          }),
        ]);
        const entriesJson = await entriesR.json();
        const summaryJson = await summaryR.json();
        if (!entriesR.ok) throw new Error(entriesJson.error ?? 'Failed to load meals');
        if (!summaryR.ok)
          throw new Error(summaryJson.error ?? 'Failed to load summary');
        setEntries(entriesJson.entries ?? []);
        setSummary(summaryJson.nutrition);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to refresh');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (date !== initialDate) void refresh(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const bySlot = useMemo(() => {
    const m: Record<MealSlot, MealEntry[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    for (const e of entries) m[e.mealSlot].push(e);
    return m;
  }, [entries]);

  const deleteEntry = async (id: string) => {
    if (!window.confirm('Delete this meal entry?')) return;
    const r = await fetch(`/api/tiresias/agentic-os/health/meals/${id}`, {
      method: 'DELETE',
    });
    if (r.ok) await refresh(date);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-[#cbd5e1]">
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-2 py-1.5 text-sm text-white focus:border-[#4361EE] focus:outline-none"
          />
        </label>
        {loading && <span className="text-xs text-[#94a3b8]">Refreshing…</span>}
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Totals label="kcal" value={summary.kcal} />
        <Totals label="protein g" value={summary.protein_g} />
        <Totals label="carbs g" value={summary.carbs_g} />
        <Totals label="fat g" value={summary.fat_g} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(Object.keys(SLOT_LABELS) as MealSlot[]).map((slot) => (
          <SlotCard
            key={slot}
            slot={slot}
            entries={bySlot[slot]}
            onAdd={() => setDrawer({ open: true, slot, editing: null })}
            onEdit={(e) => setDrawer({ open: true, slot, editing: e })}
            onDelete={(id) => void deleteEntry(id)}
          />
        ))}
      </div>

      {drawer.open && (
        <MealDrawer
          date={date}
          slot={drawer.slot}
          editing={drawer.editing}
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
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-3">
      <div className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
        {label}
      </div>
      <div className="text-xl font-semibold text-white tabular-nums">
        {value.toFixed(0)}
      </div>
    </div>
  );
}

function SlotCard({
  slot,
  entries,
  onAdd,
  onEdit,
  onDelete,
}: {
  slot: MealSlot;
  entries: MealEntry[];
  onAdd: () => void;
  onEdit: (e: MealEntry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Utensils className="h-4 w-4 text-[#4361EE]" />
          <h2 className="text-sm font-semibold text-white">
            {SLOT_LABELS[slot]}
          </h2>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-2 py-1 text-xs text-[#cbd5e1] hover:border-[#4361EE]/50 hover:text-white transition"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-[#94a3b8]">No entries yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white truncate">
                  {e.foodItem?.name ?? e.freeformDescription ?? '—'}
                </div>
                <div className="mt-1 text-xs text-[#94a3b8]">
                  {e.servings} ×{' '}
                  {e.nutrients.kcal !== null
                    ? `${Math.round(e.nutrients.kcal)} kcal`
                    : 'no kcal'}
                  {e.nutrients.protein_g !== null
                    ? ` · ${Math.round(e.nutrients.protein_g)}p`
                    : ''}
                  {e.nutrients.carbs_g !== null
                    ? ` / ${Math.round(e.nutrients.carbs_g)}c`
                    : ''}
                  {e.nutrients.fat_g !== null
                    ? ` / ${Math.round(e.nutrients.fat_g)}f`
                    : ''}
                </div>
                {e.notes && (
                  <div className="mt-1 text-xs text-[#cbd5e1] italic line-clamp-2">
                    {e.notes}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(e)}
                  className="rounded p-1 text-[#94a3b8] hover:bg-[#1a1d27] hover:text-white"
                  aria-label="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(e.id)}
                  className="rounded p-1 text-[#94a3b8] hover:bg-red-500/15 hover:text-red-300"
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
  );
}

function MealDrawer({
  date,
  slot,
  editing,
  onClose,
  onSaved,
}: {
  date: string;
  slot: MealSlot;
  editing: MealEntry | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [foodQuery, setFoodQuery] = useState(
    editing?.foodItem?.name ?? editing?.freeformDescription ?? '',
  );
  const [foodId, setFoodId] = useState<string | null>(editing?.foodItemId ?? null);
  const [servings, setServings] = useState<number>(editing?.servings ?? 1);
  const [kcal, setKcal] = useState<string>(
    editing?.kcalOverride !== null && editing?.kcalOverride !== undefined
      ? String(editing.kcalOverride)
      : '',
  );
  const [protein, setProtein] = useState<string>(
    editing?.proteinGOverride !== null && editing?.proteinGOverride !== undefined
      ? String(editing.proteinGOverride)
      : '',
  );
  const [carbs, setCarbs] = useState<string>(
    editing?.carbsGOverride !== null && editing?.carbsGOverride !== undefined
      ? String(editing.carbsGOverride)
      : '',
  );
  const [fat, setFat] = useState<string>(
    editing?.fatGOverride !== null && editing?.fatGOverride !== undefined
      ? String(editing.fatGOverride)
      : '',
  );
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numOrNull = (s: string): number | null =>
    s.trim().length === 0 ? null : Number(s);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const body = {
      entryDate: date,
      mealSlot: slot,
      foodItemId: foodId,
      freeformDescription: foodId ? null : foodQuery.trim() || null,
      servings: Number(servings),
      kcalOverride: numOrNull(kcal),
      proteinGOverride: numOrNull(protein),
      carbsGOverride: numOrNull(carbs),
      fatGOverride: numOrNull(fat),
      notes: notes.trim() || null,
    };
    const url = editing
      ? `/api/tiresias/agentic-os/health/meals/${editing.id}`
      : `/api/tiresias/agentic-os/health/meals`;
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
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl border border-[#2a2d3e] bg-[#1a1d27] p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            {editing ? 'Edit' : 'Add'} {SLOT_LABELS[slot].toLowerCase()}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[#94a3b8] hover:bg-[#0f1117] hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[#94a3b8]">
              Food (search the catalog or type freeform)
            </label>
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

          <div className="grid grid-cols-2 gap-3">
            <NumField
              label="Servings"
              value={String(servings)}
              onChange={(v) => setServings(Number(v) || 0)}
            />
            <NumField label="kcal (override)" value={kcal} onChange={setKcal} />
            <NumField
              label="Protein g (override)"
              value={protein}
              onChange={setProtein}
            />
            <NumField
              label="Carbs g (override)"
              value={carbs}
              onChange={setCarbs}
            />
            <NumField
              label="Fat g (override)"
              value={fat}
              onChange={setFat}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[#94a3b8]">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#64748b] focus:border-[#4361EE] focus:outline-none"
              placeholder="Optional"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-4 py-2 text-sm text-[#cbd5e1] hover:border-[#4361EE]/50 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#4361EE] px-4 py-2 text-sm font-medium text-white hover:bg-[#3a56d4] disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[#94a3b8]">{label}</span>
      <input
        type="number"
        step="0.1"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#64748b] focus:border-[#4361EE] focus:outline-none"
      />
    </label>
  );
}
