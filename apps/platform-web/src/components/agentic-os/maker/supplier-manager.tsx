'use client';

/**
 * Maker OS — SupplierManager.
 *
 * Supplier directory: list + edit drawer + create form. Edit lives in a small
 * inline drawer below the row so the page stays a single column on mobile.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import { Trash2, ExternalLink } from 'lucide-react';
import { DataTable, type DataTableColumn } from '../_shared/data-table';
import type { Supplier } from '@/lib/agentic-os/maker/suppliers';

const API_BASE = '/api/tiresias/agentic-os/maker/suppliers';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

interface Props {
  initialSuppliers: Supplier[];
}

export function SupplierManager({ initialSuppliers }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newSup, setNewSup] = useState({ name: '', homepageUrl: '', notes: '' });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(API_BASE);
    if (r.ok) {
      const { suppliers: ss } = await r.json();
      setSuppliers(ss ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSupplier(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newSup.name.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const r = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSup.name.trim(),
          homepageUrl: newSup.homepageUrl.trim() || null,
          notes: newSup.notes.trim() || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      setNewSup({ name: '', homepageUrl: '', notes: '' });
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAdding(false);
    }
  }

  async function saveEdit(id: string, patch: Partial<Supplier>) {
    await fetch(`${API_BASE}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function removeSupplier(id: string) {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    setOpenId(null);
    await load();
  }

  const columns: DataTableColumn<Supplier>[] = [
    {
      label: 'Name',
      render: (s) => (
        <button
          type="button"
          onClick={() => setOpenId(openId === s.id ? null : s.id)}
          className="text-white hover:text-[#4361EE] transition font-medium text-left"
        >
          {s.name}
        </button>
      ),
    },
    {
      label: 'Homepage',
      render: (s) =>
        s.homepageUrl ? (
          <a
            href={s.homepageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[#4361EE] hover:underline text-xs"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
        ) : (
          <span className="text-[#94a3b8]">—</span>
        ),
    },
    {
      label: 'Notes',
      render: (s) => (
        <span className="text-[#cbd5e1]">
          {s.notes ? (s.notes.length > 60 ? `${s.notes.slice(0, 60)}…` : s.notes) : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-4">
        <DataTable
          rows={suppliers}
          columns={columns}
          rowKey={(s) => s.id}
          empty="No suppliers yet."
        />
      </div>

      {openId && (
        <SupplierEditDrawer
          supplier={suppliers.find((s) => s.id === openId)!}
          onSave={(patch) => saveEdit(openId, patch)}
          onDelete={() => removeSupplier(openId)}
          onClose={() => setOpenId(null)}
        />
      )}

      {/* Create */}
      <form
        onSubmit={addSupplier}
        className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-4 space-y-3"
      >
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
          New supplier
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
              Name
            </span>
            <input
              value={newSup.name}
              onChange={(e) => setNewSup({ ...newSup, name: e.target.value })}
              placeholder="McMaster-Carr"
              className={inputCls}
              required
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
              Homepage URL (optional)
            </span>
            <input
              type="url"
              value={newSup.homepageUrl}
              onChange={(e) => setNewSup({ ...newSup, homepageUrl: e.target.value })}
              placeholder="https://…"
              className={inputCls}
            />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
            Notes
          </span>
          <textarea
            value={newSup.notes}
            onChange={(e) => setNewSup({ ...newSup, notes: e.target.value })}
            rows={2}
            className={inputCls}
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={adding || !newSup.name.trim()}
            className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
          >
            {adding ? 'Adding…' : 'Create supplier'}
          </button>
          {addError && <span className="text-sm text-red-300">{addError}</span>}
        </div>
      </form>
    </div>
  );
}

function SupplierEditDrawer({
  supplier,
  onSave,
  onDelete,
  onClose,
}: {
  supplier: Supplier;
  onSave: (patch: Partial<Supplier>) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    name: supplier.name,
    homepageUrl: supplier.homepageUrl ?? '',
    notes: supplier.notes ?? '',
  });
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-[#4361EE]/60 bg-[#1a1d27] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">Edit {supplier.name}</h4>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-[#94a3b8] hover:text-white transition"
        >
          Close
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
            Name
          </span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
            Homepage URL
          </span>
          <input
            type="url"
            value={draft.homepageUrl}
            onChange={(e) => setDraft({ ...draft, homepageUrl: e.target.value })}
            className={inputCls}
          />
        </label>
      </div>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
          Notes
        </span>
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          rows={3}
          className={inputCls}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onSave({
              name: draft.name.trim(),
              homepageUrl: draft.homepageUrl.trim() || null,
              notes: draft.notes.trim() || null,
            });
            setBusy(false);
          }}
          className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => void onDelete()}
          className="inline-flex items-center gap-1 text-xs text-[#94a3b8] hover:text-red-300 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete supplier
        </button>
      </div>
    </div>
  );
}
