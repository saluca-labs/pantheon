'use client';

/**
 * Maker OS — BuildsManager client component.
 *
 * Renders the "My Builds" list and a new-build form. Parts for a selected
 * build are shown in an inline panel.
 *
 * All data is fetched from /api/tiresias/agentic-os/maker/builds.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { useState, useEffect, useCallback } from 'react';
import type { BuildProject, PartItem, BuildStatus, PartCategory } from '@/lib/agentic-os/maker/inventory';
import { BUILD_STATUSES, PART_CATEGORIES, summariseInventory } from '@/lib/agentic-os/maker/inventory';

const API = '/api/tiresias/agentic-os/maker/builds';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

const STATUS_COLOR: Record<BuildStatus, string> = {
  planning: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  in_progress: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  on_hold: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
  complete: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  archived: 'text-[#94a3b8] bg-[#1a1d27] border-[#2a2d3e]',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">{label}</span>
      {children}
    </label>
  );
}

// ─── New Build Form ─────────────────────────────────────────────────────────

function NewBuildForm({ onCreated }: { onCreated: (b: BuildProject) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<BuildStatus>('planning');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          status,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { build } = await r.json();
      onCreated(build);
      setName('');
      setDescription('');
      setStatus('planning');
      setTags('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
      <h3 className="text-sm font-semibold text-white">New build</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Project name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CNC router v2"
            className={inputCls}
            required
          />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as BuildStatus)} className={inputCls}>
            {BUILD_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className={inputCls} />
      </Field>
      <Field label="Tags (comma-separated)">
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. electronics, CNC, 3D printing" className={inputCls} />
      </Field>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 text-sm transition"
        >
          {saving ? 'Creating…' : 'Create build'}
        </button>
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </form>
  );
}

// ─── Parts Panel ───────────────────────────────────────────────────────────

function PartsPanel({ build }: { build: BuildProject }) {
  const [parts, setParts] = useState<PartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPart, setNewPart] = useState({ name: '', category: 'other' as PartCategory, quantity: 1, unit: 'pcs', notes: '', sourceUrl: '', inStock: false });
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/${build.id}/parts`);
      if (r.ok) {
        const { parts: p } = await r.json();
        setParts(p ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [build.id]);

  useEffect(() => { load(); }, [load]);

  const stats = summariseInventory(parts);

  async function addPart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newPart.name.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const r = await fetch(`${API}/${build.id}/parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newPart, name: newPart.name.trim(), notes: newPart.notes || null, sourceUrl: newPart.sourceUrl || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      await load();
      setNewPart({ name: '', category: 'other', quantity: 1, unit: 'pcs', notes: '', sourceUrl: '', inStock: false });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAdding(false);
    }
  }

  async function toggleStock(part: PartItem) {
    await fetch(`${API}/${build.id}/parts`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: part.id, inStock: !part.inStock }),
    });
    await load();
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Inventory summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-[#94a3b8]">{stats.total} parts total</span>
        <span className="text-emerald-300">{stats.inStock} in stock</span>
        {stats.missing > 0 && <span className="text-amber-300">{stats.missing} missing</span>}
        <span className="text-[#94a3b8]">{stats.pctReady}% ready</span>
      </div>

      {/* Parts list */}
      {loading ? (
        <p className="text-sm text-[#94a3b8]">Loading parts…</p>
      ) : parts.length === 0 ? (
        <p className="text-sm text-[#94a3b8]">No parts yet. Add one below.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#94a3b8] border-b border-[#2a2d3e]">
                <th className="pb-2 pr-3">Name</th>
                <th className="pb-2 pr-3">Category</th>
                <th className="pb-2 pr-3">Qty</th>
                <th className="pb-2 pr-3">Unit</th>
                <th className="pb-2">In stock</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id} className="border-b border-[#2a2d3e]/50">
                  <td className="py-2 pr-3 text-white">{p.name}</td>
                  <td className="py-2 pr-3 text-[#94a3b8]">{p.category}</td>
                  <td className="py-2 pr-3 text-white">{p.quantity}</td>
                  <td className="py-2 pr-3 text-[#94a3b8]">{p.unit}</td>
                  <td className="py-2">
                    <button
                      onClick={() => toggleStock(p)}
                      className={`text-xs px-2 py-0.5 rounded border transition ${p.inStock ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-[#94a3b8] bg-[#0f1117] border-[#2a2d3e]'}`}
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
      <form onSubmit={addPart} className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-4 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">Add part</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Name">
            <input value={newPart.name} onChange={(e) => setNewPart({ ...newPart, name: e.target.value })} placeholder="e.g. NEMA 17 stepper" className={inputCls} required />
          </Field>
          <Field label="Category">
            <select value={newPart.category} onChange={(e) => setNewPart({ ...newPart, category: e.target.value as PartCategory })} className={inputCls}>
              {PART_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <div className="flex gap-2">
            <div className="flex-1">
              <Field label="Qty">
                <input type="number" min={1} value={newPart.quantity} onChange={(e) => setNewPart({ ...newPart, quantity: Number(e.target.value) })} className={inputCls} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Unit">
                <input value={newPart.unit} onChange={(e) => setNewPart({ ...newPart, unit: e.target.value })} className={inputCls} />
              </Field>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={adding || !newPart.name.trim()} className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition">
            {adding ? 'Adding…' : 'Add part'}
          </button>
          {addError && <span className="text-sm text-red-300">{addError}</span>}
        </div>
      </form>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function BuildsManager({ initialBuilds }: { initialBuilds: BuildProject[] }) {
  const [builds, setBuilds] = useState<BuildProject[]>(initialBuilds);
  const [selected, setSelected] = useState<BuildProject | null>(null);

  function onCreated(b: BuildProject) {
    setBuilds((prev) => [b, ...prev]);
  }

  return (
    <div className="space-y-6">
      <NewBuildForm onCreated={onCreated} />

      {builds.length === 0 ? (
        <p className="text-sm text-[#94a3b8]">No builds yet. Create your first project above.</p>
      ) : (
        <div className="space-y-3">
          {builds.map((b) => (
            <div key={b.id} className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-white font-medium">{b.name}</h3>
                    <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_COLOR[b.status]}`}>
                      {b.status.replace('_', ' ')}
                    </span>
                  </div>
                  {b.description && <p className="text-sm text-[#94a3b8] mt-1">{b.description}</p>}
                  {b.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {b.tags.map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelected(selected?.id === b.id ? null : b)}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8] hover:text-white transition"
                >
                  {selected?.id === b.id ? 'Hide parts' : 'View parts'}
                </button>
              </div>

              {selected?.id === b.id && <PartsPanel build={b} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
