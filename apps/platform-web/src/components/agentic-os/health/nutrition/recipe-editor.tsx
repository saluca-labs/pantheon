'use client';

/**
 * Recipe builder/editor — shared by create + edit flows.
 *
 * Server passes ``initialRecipe`` (null for create) + ``initialNutrition``
 * (null for create). After save, the client refetches /nutrition and
 * rewrites the URL to the detail page. Ingredients reorder via up/down
 * arrows — we don't ship a dnd library in 5b per scope.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import {
  FoodCombobox,
  type FoodPickerItem,
} from '@/components/agentic-os/health/nutrition/food-combobox';

export interface RecipeEditorIngredient {
  id?: string;
  foodItemId: string | null;
  foodItem?: {
    id: string;
    name: string;
    brand: string | null;
    kcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    servingSizeG: number | null;
  } | null;
  freeformName: string | null;
  quantity: number;
  unit: string | null;
  notes: string | null;
}

export interface RecipeEditorRecipe {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  instructions: string | null;
  tags: string[];
  imageUrl: string | null;
  ingredients: RecipeEditorIngredient[];
}

export interface RecipeNutritionData {
  servings: number;
  total: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  perServing: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  partial: number;
}

export interface RecipeEditorProps {
  initialRecipe: RecipeEditorRecipe | null;
  initialNutrition?: RecipeNutritionData | null;
}

const COMMON_UNITS = ['g', 'kg', 'oz', 'lb', 'cup', 'tbsp', 'tsp'];

export function RecipeEditor({
  initialRecipe,
  initialNutrition,
}: RecipeEditorProps) {
  const router = useRouter();
  const [recipeId, setRecipeId] = useState<string | null>(
    initialRecipe?.id ?? null,
  );
  const [name, setName] = useState(initialRecipe?.name ?? '');
  const [description, setDescription] = useState(
    initialRecipe?.description ?? '',
  );
  const [servings, setServings] = useState<number>(
    initialRecipe?.servings ?? 1,
  );
  const [prepMinutes, setPrepMinutes] = useState<string>(
    initialRecipe?.prepMinutes !== null && initialRecipe?.prepMinutes !== undefined
      ? String(initialRecipe.prepMinutes)
      : '',
  );
  const [cookMinutes, setCookMinutes] = useState<string>(
    initialRecipe?.cookMinutes !== null && initialRecipe?.cookMinutes !== undefined
      ? String(initialRecipe.cookMinutes)
      : '',
  );
  const [instructions, setInstructions] = useState(
    initialRecipe?.instructions ?? '',
  );
  const [tagsText, setTagsText] = useState(
    (initialRecipe?.tags ?? []).join(', '),
  );
  const [imageUrl, setImageUrl] = useState(initialRecipe?.imageUrl ?? '');
  const [ingredients, setIngredients] = useState<RecipeEditorIngredient[]>(
    initialRecipe?.ingredients ?? [],
  );
  const [nutrition, setNutrition] = useState<RecipeNutritionData | null>(
    initialNutrition ?? null,
  );
  const [savingHeader, setSavingHeader] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNutrition = useCallback(async (id: string) => {
    const r = await fetch(
      `/api/tiresias/agentic-os/health/recipes/${id}/nutrition`,
      { cache: 'no-store' },
    );
    if (r.ok) {
      const j = await r.json();
      setNutrition(j.nutrition);
    }
  }, []);

  useEffect(() => {
    if (recipeId && !nutrition) void fetchNutrition(recipeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  const saveHeader = async () => {
    setSavingHeader(true);
    setError(null);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        servings: Number(servings) || 1,
        prepMinutes: prepMinutes.trim() ? Number(prepMinutes) : null,
        cookMinutes: cookMinutes.trim() ? Number(cookMinutes) : null,
        instructions: instructions.trim() || null,
        tags,
        imageUrl: imageUrl.trim() || null,
      };
      const url = recipeId
        ? `/api/tiresias/agentic-os/health/recipes/${recipeId}`
        : `/api/tiresias/agentic-os/health/recipes`;
      const r = await fetch(url, {
        method: recipeId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? 'Save failed');
        return;
      }
      const newId = j.recipe.id as string;
      if (!recipeId) {
        setRecipeId(newId);
        // Replace URL so reloads land on the detail page.
        router.replace(`/dashboard/os/health/recipes/${newId}`);
      } else {
        await fetchNutrition(newId);
      }
    } finally {
      setSavingHeader(false);
    }
  };

  const addIngredient = async (
    item: {
      foodItemId?: string | null;
      freeformName?: string | null;
      quantity: number;
      unit?: string | null;
      notes?: string | null;
    },
  ): Promise<boolean> => {
    if (!recipeId) {
      setError('Save the recipe header first to add ingredients.');
      return false;
    }
    const r = await fetch(
      `/api/tiresias/agentic-os/health/recipes/${recipeId}/ingredients`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      },
    );
    const j = await r.json();
    if (!r.ok) {
      setError(j.error ?? 'Add ingredient failed');
      return false;
    }
    setIngredients((prev) => [...prev, j.ingredient]);
    if (recipeId) await fetchNutrition(recipeId);
    return true;
  };

  const updateIngredient = async (
    ing: RecipeEditorIngredient,
    patch: Partial<RecipeEditorIngredient>,
  ) => {
    if (!recipeId || !ing.id) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/health/recipes/${recipeId}/ingredients/${ing.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
    );
    const j = await r.json();
    if (r.ok) {
      setIngredients((prev) =>
        prev.map((p) => (p.id === ing.id ? j.ingredient : p)),
      );
      await fetchNutrition(recipeId);
    }
  };

  const deleteIngredient = async (ing: RecipeEditorIngredient) => {
    if (!recipeId || !ing.id) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/health/recipes/${recipeId}/ingredients/${ing.id}`,
      { method: 'DELETE' },
    );
    if (r.ok) {
      setIngredients((prev) => prev.filter((p) => p.id !== ing.id));
      await fetchNutrition(recipeId);
    }
  };

  const reorder = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= ingredients.length) return;
    const next = [...ingredients];
    [next[idx], next[target]] = [next[target], next[idx]];
    setIngredients(next);
    if (!recipeId) return;
    const orderedIds = next.map((n) => n.id).filter((id): id is string => !!id);
    await fetch(
      `/api/tiresias/agentic-os/health/recipes/${recipeId}/ingredients`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      },
    );
    await fetchNutrition(recipeId);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="e.g. Overnight oats"
              />
            </Field>
            <Field label="Servings">
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={String(servings)}
                onChange={(e) => setServings(Number(e.target.value) || 1)}
                className="input"
              />
            </Field>
            <Field label="Prep minutes">
              <input
                type="number"
                min="0"
                value={prepMinutes}
                onChange={(e) => setPrepMinutes(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Cook minutes">
              <input
                type="number"
                min="0"
                value={cookMinutes}
                onChange={(e) => setCookMinutes(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Image URL" wide>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="input"
                placeholder="https://… (optional)"
              />
            </Field>
            <Field label="Tags (comma-separated)" wide>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                className="input"
                placeholder="e.g. breakfast, high-protein"
              />
            </Field>
            <Field label="Description" wide>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input"
                placeholder="Optional summary"
              />
            </Field>
            <Field label="Instructions (markdown)" wide>
              <textarea
                rows={6}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="input font-mono text-xs"
                placeholder={'1. Mix oats…\n2. Refrigerate overnight'}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={saveHeader}
              disabled={savingHeader || name.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {savingHeader
                ? 'Saving…'
                : recipeId
                  ? 'Save recipe'
                  : 'Create recipe'}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Ingredients</h2>
            {!recipeId && (
              <span className="text-[11px] text-text-secondary">
                Save the header first to add ingredients.
              </span>
            )}
          </div>
          <ul className="space-y-2">
            {ingredients.map((ing, i) => (
              <IngredientRow
                key={ing.id ?? `new-${i}`}
                ing={ing}
                onUpdate={(patch) => updateIngredient(ing, patch)}
                onDelete={() => deleteIngredient(ing)}
                onMoveUp={i > 0 ? () => reorder(i, -1) : undefined}
                onMoveDown={
                  i < ingredients.length - 1
                    ? () => reorder(i, 1)
                    : undefined
                }
              />
            ))}
          </ul>
          {recipeId && (
            <NewIngredientForm onAdd={(it) => addIngredient(it)} />
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-5 sticky top-4">
          <h3 className="text-sm font-semibold text-white mb-3">Nutrition</h3>
          {!nutrition ? (
            <p className="text-xs text-text-secondary">
              Add ingredients to see computed nutrition.
            </p>
          ) : (
            <NutritionPanel nutrition={nutrition} />
          )}
        </div>
      </aside>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--border-subtle);
          background: var(--surface-0);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: var(--text-primary);
        }
        :global(.input:focus) {
          outline: none;
          border-color: var(--accent-base);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-xs text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

function IngredientRow({
  ing,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  ing: RecipeEditorIngredient;
  onUpdate: (patch: Partial<RecipeEditorIngredient>) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const label = ing.foodItem?.name ?? ing.freeformName ?? '—';
  const sublabel = ing.foodItem?.brand ?? null;
  return (
    <li className="rounded-lg border border-border-subtle bg-surface-0 p-3">
      <div className="flex items-start gap-2">
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            className="rounded p-0.5 text-text-secondary hover:bg-surface-2 hover:text-white disabled:opacity-30"
            aria-label="Move up"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            className="rounded p-0.5 text-text-secondary hover:bg-surface-2 hover:text-white disabled:opacity-30"
            aria-label="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white truncate">{label}</div>
          {sublabel && (
            <div className="text-xs text-text-secondary truncate">{sublabel}</div>
          )}
          <div className="mt-1.5 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-[10px] text-text-secondary">Qty</span>
              <input
                type="number"
                step="0.1"
                min="0"
                defaultValue={String(ing.quantity)}
                onBlur={(e) =>
                  onUpdate({ quantity: Number(e.target.value) || 0 })
                }
                className="input w-20"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-text-secondary">Unit</span>
              <select
                defaultValue={ing.unit ?? ''}
                onChange={(e) =>
                  onUpdate({ unit: e.target.value || null })
                }
                className="input w-24"
              >
                <option value="">—</option>
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="block flex-1 min-w-[180px]">
              <span className="text-[10px] text-text-secondary">Notes</span>
              <input
                defaultValue={ing.notes ?? ''}
                onBlur={(e) =>
                  onUpdate({ notes: e.target.value.trim() || null })
                }
                className="input"
                placeholder="optional"
              />
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1 text-text-secondary hover:bg-danger/15 hover:text-danger"
          aria-label="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function NewIngredientForm({
  onAdd,
}: {
  onAdd: (ing: {
    foodItemId?: string | null;
    freeformName?: string | null;
    quantity: number;
    unit?: string | null;
    notes?: string | null;
  }) => Promise<boolean>;
}) {
  const [query, setQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodPickerItem | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<string>('g');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setQuery('');
    setSelectedFood(null);
    setQuantity(1);
    setUnit('g');
  };

  const submit = async () => {
    if (!query.trim() && !selectedFood) return;
    setSubmitting(true);
    const ok = await onAdd({
      foodItemId: selectedFood?.id ?? null,
      freeformName: selectedFood ? null : query.trim() || null,
      quantity: Number(quantity) || 1,
      unit: unit || null,
    });
    setSubmitting(false);
    if (ok) reset();
  };

  return (
    <div className="mt-3 rounded-lg border border-dashed border-border-subtle bg-surface-0 p-3 space-y-2">
      <div className="text-[11px] uppercase tracking-wide text-text-secondary">
        Add ingredient
      </div>
      <FoodCombobox
        value={query}
        onChange={setQuery}
        onSelect={(it) => {
          setSelectedFood(it);
          if (it?.name) setQuery(it.name);
        }}
        selectedId={selectedFood?.id ?? null}
      />
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-[10px] text-text-secondary">Qty</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={String(quantity)}
            onChange={(e) => setQuantity(Number(e.target.value) || 0)}
            className="input w-20"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-text-secondary">Unit</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="input w-24"
          >
            <option value="">—</option>
            {COMMON_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || (!query.trim() && !selectedFood)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    </div>
  );
}

function NutritionPanel({ nutrition }: { nutrition: RecipeNutritionData }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-text-secondary">
          Per serving ({nutrition.servings.toFixed(1)} servings)
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-white">
          <Macro label="kcal" value={nutrition.perServing.kcal} />
          <Macro label="protein g" value={nutrition.perServing.protein_g} />
          <Macro label="carbs g" value={nutrition.perServing.carbs_g} />
          <Macro label="fat g" value={nutrition.perServing.fat_g} />
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-text-secondary">
          Total
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-white">
          <Macro label="kcal" value={nutrition.total.kcal} />
          <Macro label="protein g" value={nutrition.total.protein_g} />
          <Macro label="carbs g" value={nutrition.total.carbs_g} />
          <Macro label="fat g" value={nutrition.total.fat_g} />
        </div>
      </div>
      {nutrition.partial > 0 && (
        <div className="text-[11px] text-warning/80">
          {nutrition.partial} ingredient{nutrition.partial === 1 ? '' : 's'} could
          not be auto-converted to grams — totals are partial.
        </div>
      )}
    </div>
  );
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-0 px-3 py-2">
      <div className="text-[10px] text-text-secondary">{label}</div>
      <div className="text-base tabular-nums">{value.toFixed(0)}</div>
    </div>
  );
}
