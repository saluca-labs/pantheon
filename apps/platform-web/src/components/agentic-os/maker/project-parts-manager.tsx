'use client';

/**
 * Maker OS — ProjectPartsManager.
 *
 * The Parts tab on the per-project detail page. Lifted from `BuildsManager`'s
 * inline parts panel — same shape, just hung off the new `projects/[id]/parts`
 * route. Phase 2 will replace this with a proper BOM editor.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import type { PartCategory, PartItem } from '@/lib/agentic-os/maker/inventory';
import { PART_CATEGORIES, summariseInventory } from '@/lib/agentic-os/maker/inventory';

const API_BASE = '/api/tiresias/agentic-os/maker/projects';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

interface Props {
  projectId: string;
  initialParts: PartItem[];
}

export function ProjectPartsManager({ projectId, initialParts }: Props) {
  const [parts, setParts] = useState<PartItem[]>(initialParts);
  const [newPart, setNewPart] = useState({
    name: '',
    category: 'other' as PartCategory,
    quantity: 1,
    unit: 'pcs',
    notes: '',
    sourceUrl: '',
    inStock: false,
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`${API_BASE}/${projectId}/parts`);
    if (r.ok) {
      const { parts: p } = await r.json();
      setParts(p ?? []);
    }
  }, [projectId]);

  useEffect(() => {
    // initial fetch is unnecessary if SSR populated initialParts, but a
    // refresh after the page hydrates keeps the list in sync with audit-log
    // writes from other tabs.
    void load();
  }, [load]);

  const stats = summariseInventory(parts);

  async function addPart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newPart.name.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const r = await fetch(`${API_BASE}/${projectId}/parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newPart,
          name: newPart.name.trim(),
          notes: newPart.notes || null,
          sourceUrl: newPart.sourceUrl || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      await load();
      setNewPart({
        name: '',
        category: 'other',
        quantity: 1,
        unit: 'pcs',
        notes: '',
        sourceUrl: '',
        inStock: false,
      });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAdding(false);
    }
  }

  async function toggleStock(part: PartItem) {
    await fetch(`${API_BASE}/${projectId}/parts`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: part.id, inStock: !part.inStock }),
    });
    await load();
  }

  return (
    <div className="space-y-4">
      {/* Inventory summary */}
      <div className="flex gap-4 text-sm flex-wrap">
        <span className="text-[#94a3b8]">{stats.total} parts total</span>
        <span className="text-emerald-300">{stats.inStock} in stock</span>
        {stats.missing > 0 && <span className="text-amber-300">{stats.missing} missing</span>}
        <span className="text-[#94a3b8]">{stats.pctReady}% ready</span>
      </div>

      {/* Parts list */}
      {parts.length === 0 ? (
        <p className="text-sm text-[#94a3b8]">No parts yet. Add one below.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#2a2d3e] bg-[#1a1d27]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#94a3b8] border-b border-[#2a2d3e]">
                <th className="p-3">Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Unit</th>
                <th className="p-3">In stock</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id} className="border-b border-[#2a2d3e]/50 last:border-b-0">
                  <td className="p-3 text-white">{p.name}</td>
                  <td className="p-3 text-[#94a3b8]">{p.category}</td>
                  <td className="p-3 text-white">{p.quantity}</td>
                  <td className="p-3 text-[#94a3b8]">{p.unit}</td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => toggleStock(p)}
                      className={`text-xs px-2 py-0.5 rounded border transition ${
                        p.inStock
                          ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                          : 'text-[#94a3b8] bg-[#0f1117] border-[#2a2d3e] hover:text-white'
                      }`}
                    >
                      {p.inStock ? 'Yes' : 'No'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add part form */}
      <form
        onSubmit={addPart}
        className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-4 space-y-3"
      >
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
          Add part
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Name">
            <input
              value={newPart.name}
              onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
              placeholder="e.g. NEMA 17 stepper"
              className={inputCls}
              required
            />
          </Field>
          <Field label="Category">
            <select
              value={newPart.category}
              onChange={(e) =>
                setNewPart({ ...newPart, category: e.target.value as PartCategory })
              }
              className={inputCls}
            >
              {PART_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-2">
            <div className="flex-1">
              <Field label="Qty">
                <input
                  type="number"
                  min={1}
                  value={newPart.quantity}
                  onChange={(e) =>
                    setNewPart({ ...newPart, quantity: Number(e.target.value) })
                  }
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Unit">
                <input
                  value={newPart.unit}
                  onChange={(e) => setNewPart({ ...newPart, unit: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={adding || !newPart.name.trim()}
            className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
          >
            {adding ? 'Adding…' : 'Add part'}
          </button>
          {addError && <span className="text-sm text-red-300">{addError}</span>}
        </div>
      </form>
    </div>
  );
}
