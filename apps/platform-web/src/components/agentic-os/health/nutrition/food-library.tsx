'use client';

/**
 * Custom-food library client component. Lists the user's custom food
 * items and offers create/edit/delete via a drawer. Used on the
 * /nutrition/foods page.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  servingSizeG: number | null;
  servingLabel: string | null;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

export interface FoodLibraryProps {
  initialItems: FoodItem[];
}

interface DrawerState {
  open: boolean;
  editing: FoodItem | null;
}

const EMPTY_DRAWER: DrawerState = { open: false, editing: null };

export function FoodLibrary({ initialItems }: FoodLibraryProps) {
  const [items, setItems] = useState<FoodItem[]>(initialItems);
  const [drawer, setDrawer] = useState<DrawerState>(EMPTY_DRAWER);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/tiresias/agentic-os/health/food?limit=200`, {
        cache: 'no-store',
      });
      const j = await r.json();
      if (r.ok) setItems(j.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const onDelete = async (id: string) => {
    if (!window.confirm('Delete this custom food?')) return;
    const r = await fetch(`/api/tiresias/agentic-os/health/food/${id}`, {
      method: 'DELETE',
    });
    if (r.ok) await refresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">
          {items.length} custom food{items.length === 1 ? '' : 's'}
          {loading ? ' · refreshing…' : ''}
        </span>
        <button
          type="button"
          onClick={() => setDrawer({ open: true, editing: null })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-[#3a56d4]"
        >
          <Plus className="h-4 w-4" />
          Create food
        </button>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-2">
        {items.length === 0 ? (
          <p className="p-6 text-sm text-text-secondary">
            No custom foods yet. Create one to use it in meal entries.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-start justify-between gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white truncate">
                    {it.name}
                    {it.brand && (
                      <span className="ml-2 text-xs font-normal text-text-secondary">
                        {it.brand}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {it.servingLabel
                      ? `${it.servingLabel}`
                      : it.servingSizeG
                        ? `${it.servingSizeG} g`
                        : 'per serving'}
                    {' · '}
                    {it.kcal !== null ? `${it.kcal} kcal` : 'no kcal'}
                    {it.proteinG !== null ? ` · ${it.proteinG}p` : ''}
                    {it.carbsG !== null ? ` / ${it.carbsG}c` : ''}
                    {it.fatG !== null ? ` / ${it.fatG}f` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setDrawer({ open: true, editing: it })}
                    className="rounded p-1 text-text-secondary hover:bg-surface-0 hover:text-white"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(it.id)}
                    className="rounded p-1 text-text-secondary hover:bg-red-500/15 hover:text-red-300"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {drawer.open && (
        <FoodDrawer
          editing={drawer.editing}
          onClose={() => setDrawer(EMPTY_DRAWER)}
          onSaved={async () => {
            setDrawer(EMPTY_DRAWER);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function FoodDrawer({
  editing,
  onClose,
  onSaved,
}: {
  editing: FoodItem | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [brand, setBrand] = useState(editing?.brand ?? '');
  const [servingSizeG, setServingSizeG] = useState(
    editing?.servingSizeG !== null && editing?.servingSizeG !== undefined
      ? String(editing.servingSizeG)
      : '',
  );
  const [servingLabel, setServingLabel] = useState(editing?.servingLabel ?? '');
  const [kcal, setKcal] = useState(
    editing?.kcal !== null && editing?.kcal !== undefined ? String(editing.kcal) : '',
  );
  const [protein, setProtein] = useState(
    editing?.proteinG !== null && editing?.proteinG !== undefined
      ? String(editing.proteinG)
      : '',
  );
  const [carbs, setCarbs] = useState(
    editing?.carbsG !== null && editing?.carbsG !== undefined
      ? String(editing.carbsG)
      : '',
  );
  const [fat, setFat] = useState(
    editing?.fatG !== null && editing?.fatG !== undefined ? String(editing.fatG) : '',
  );
  const [fiber, setFiber] = useState(
    editing?.fiberG !== null && editing?.fiberG !== undefined
      ? String(editing.fiberG)
      : '',
  );
  const [sugar, setSugar] = useState(
    editing?.sugarG !== null && editing?.sugarG !== undefined
      ? String(editing.sugarG)
      : '',
  );
  const [sodium, setSodium] = useState(
    editing?.sodiumMg !== null && editing?.sodiumMg !== undefined
      ? String(editing.sodiumMg)
      : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numOrNull = (s: string): number | null =>
    s.trim().length === 0 ? null : Number(s);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const body = {
      name: name.trim(),
      brand: brand.trim() || null,
      servingSizeG: numOrNull(servingSizeG),
      servingLabel: servingLabel.trim() || null,
      kcal: numOrNull(kcal),
      proteinG: numOrNull(protein),
      carbsG: numOrNull(carbs),
      fatG: numOrNull(fat),
      fiberG: numOrNull(fiber),
      sugarG: numOrNull(sugar),
      sodiumMg: numOrNull(sodium),
    };
    const url = editing
      ? `/api/tiresias/agentic-os/health/food/${editing.id}`
      : `/api/tiresias/agentic-os/health/food`;
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
      aria-label={editing ? 'Edit food' : 'New custom food'}
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
            {editing ? 'Edit food' : 'New custom food'}
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
          <TextField label="Name" value={name} onChange={setName} required />
          <TextField label="Brand" value={brand} onChange={setBrand} />
          <div className="grid grid-cols-2 gap-3">
            <NumField
              label="Serving size (g)"
              value={servingSizeG}
              onChange={setServingSizeG}
            />
            <TextField
              label="Serving label"
              value={servingLabel}
              onChange={setServingLabel}
              placeholder="1 cup, 2 oz"
            />
            <NumField label="kcal" value={kcal} onChange={setKcal} />
            <NumField label="Protein g" value={protein} onChange={setProtein} />
            <NumField label="Carbs g" value={carbs} onChange={setCarbs} />
            <NumField label="Fat g" value={fat} onChange={setFat} />
            <NumField label="Fiber g" value={fiber} onChange={setFiber} />
            <NumField label="Sugar g" value={sugar} onChange={setSugar} />
            <NumField label="Sodium mg" value={sodium} onChange={setSodium} />
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
              className="rounded-lg border border-border-subtle bg-surface-0 px-4 py-2 text-sm text-text-primary hover:border-accent/50 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || name.trim().length === 0}
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

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-text-secondary">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-[#64748b] focus:border-accent focus:outline-none"
      />
    </label>
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
      <span className="mb-1 block text-xs text-text-secondary">{label}</span>
      <input
        type="number"
        step="0.1"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-[#64748b] focus:border-accent focus:outline-none"
      />
    </label>
  );
}
