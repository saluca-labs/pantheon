'use client';

/**
 * Maker OS — VariantEditor.
 *
 * Inline editor for catalog-row variants. Lists existing variants in a small
 * table, lets the user edit on-hand counts in place, and exposes a tiny form
 * to create new variants.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { useCallback, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { formatQuantity, type PartVariant } from '@/lib/agentic-os/maker/catalog';

const API_BASE = '/api/tiresias/agentic-os/maker';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

interface Props {
  catalogId: string;
  initialVariants: PartVariant[];
  onChange?: (variants: PartVariant[]) => void;
}

export function VariantEditor({ catalogId, initialVariants, onChange }: Props) {
  const [variants, setVariants] = useState<PartVariant[]>(initialVariants);
  const [newLabel, setNewLabel] = useState('');
  const [newOnHand, setNewOnHand] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await fetch(`${API_BASE}/catalog/${catalogId}/variants`);
    if (r.ok) {
      const { variants: vs } = await r.json();
      setVariants(vs ?? []);
      onChange?.(vs ?? []);
    }
  }, [catalogId, onChange]);

  async function addVariant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setBusy(true);
    try {
      await fetch(`${API_BASE}/catalog/${catalogId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantLabel: newLabel.trim(),
          quantityOnHand: newOnHand,
        }),
      });
      setNewLabel('');
      setNewOnHand(0);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function patchVariant(v: PartVariant, qty: number) {
    await fetch(`${API_BASE}/catalog/${catalogId}/variants`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: v.id, quantityOnHand: qty }),
    });
    await refresh();
  }

  async function removeVariant(v: PartVariant) {
    await fetch(`${API_BASE}/catalog/${catalogId}/variants?variantId=${v.id}`, {
      method: 'DELETE',
    });
    await refresh();
  }

  return (
    <div className="space-y-3">
      {variants.length === 0 ? (
        <p className="text-sm text-text-secondary">No variants yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="py-2 pr-4 font-normal">Label</th>
                <th className="py-2 pr-4 font-normal">On hand</th>
                <th className="py-2 pr-4 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="border-t border-border-subtle">
                  <td className="py-2 pr-4 text-white">{v.variantLabel}</td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      defaultValue={v.quantityOnHand}
                      onBlur={(e) => {
                        const qty = Number(e.target.value);
                        if (qty !== v.quantityOnHand && qty >= 0) {
                          void patchVariant(v, qty);
                        }
                      }}
                      className={`${inputCls} w-24`}
                      aria-label={`On-hand for ${v.variantLabel}`}
                    />
                    <span className="text-xs text-text-secondary ml-2">
                      ({formatQuantity(v.quantityOnHand)})
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      onClick={() => void removeVariant(v)}
                      className="text-xs text-text-secondary hover:text-red-300 transition"
                      aria-label="Remove variant"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        onSubmit={addVariant}
        className="flex flex-wrap gap-3 pt-3 border-t border-border-subtle"
      >
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Variant label (e.g. red / 1m / M3)"
          className={`${inputCls} max-w-xs`}
          required
        />
        <input
          type="number"
          min={0}
          step="any"
          value={newOnHand}
          onChange={(e) => setNewOnHand(Number(e.target.value))}
          placeholder="On hand"
          className={`${inputCls} max-w-[8rem]`}
        />
        <button
          type="submit"
          disabled={busy || !newLabel.trim()}
          className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
        >
          {busy ? 'Adding…' : 'Add variant'}
        </button>
      </form>
    </div>
  );
}
