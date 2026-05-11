'use client';

/**
 * Filmmaker OS — BreakdownElementForm.
 *
 * Add-or-edit form for a single element. Used inline inside the
 * SceneBreakdownEditor. POSTs to /scenes/[sceneId]/breakdown-elements
 * on create, PATCHes /breakdown-elements/[id] on edit.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, X } from 'lucide-react';
import {
  BREAKDOWN_CATEGORIES,
  type BreakdownCategory,
  type BreakdownElement,
} from '@/lib/agentic-os/filmmaker/breakdown';

interface Props {
  sceneId: string;
  initial?: BreakdownElement | null;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function BreakdownElementForm({ sceneId, initial, onSaved, onCancel }: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<BreakdownCategory>(
    initial?.category ?? 'props',
  );
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [quantity, setQuantity] = useState<number>(initial?.quantity ?? 1);
  const [isPrincipal, setIsPrincipal] = useState<boolean>(
    initial?.isPrincipal ?? false,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        category,
        name: name.trim(),
        description: description.trim() || null,
        quantity,
        isPrincipal,
      };
      const res = initial
        ? await fetch(`/api/tiresias/agentic-os/filmmaker/breakdown-elements/${initial.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(
            `/api/tiresias/agentic-os/filmmaker/scenes/${sceneId}/breakdown-elements`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            },
          );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Save failed');
      }
      router.refresh();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 p-3 rounded-lg border border-[#2a2d3e] bg-[#0f1117]">
      <div className="flex flex-wrap gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as BreakdownCategory)}
          className="text-xs bg-[#1a1d27] border border-[#2a2d3e] rounded px-2 py-1.5 text-white"
        >
          {BREAKDOWN_CATEGORIES.map((c) => (
            <option key={c.category} value={c.category}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. SARAH, Coffee cup, 1950s Cadillac)"
          className="flex-1 min-w-[180px] text-xs bg-[#1a1d27] border border-[#2a2d3e] rounded px-2 py-1.5 text-white placeholder-[#64748b]"
          required
        />
        <input
          type="number"
          min={1}
          max={10000}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          className="w-16 text-xs bg-[#1a1d27] border border-[#2a2d3e] rounded px-2 py-1.5 text-white"
          title="Quantity"
        />
        {category === 'cast' && (
          <label className="flex items-center gap-1.5 text-xs text-[#94a3b8] px-2">
            <input
              type="checkbox"
              checked={isPrincipal}
              onChange={(e) => setIsPrincipal(e.target.checked)}
            />
            Principal
          </label>
        )}
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Optional description"
        rows={2}
        className="w-full text-xs bg-[#1a1d27] border border-[#2a2d3e] rounded px-2 py-1.5 text-white placeholder-[#64748b]"
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex items-center gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-[#2a2d3e] text-[#94a3b8] hover:text-white"
          >
            <X className="w-3 h-3" /> Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded bg-[#4361EE] text-white disabled:opacity-40"
        >
          <Save className="w-3 h-3" /> {initial ? 'Update' : 'Add'}
        </button>
      </div>
    </form>
  );
}
