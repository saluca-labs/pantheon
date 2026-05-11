'use client';

/**
 * Maker OS — CatalogManager.
 *
 * Workshop-global parts catalog list. Renders a searchable, filterable table
 * of catalog rows plus an inline create form. Each row links to its detail
 * page (`/dashboard/os/maker/catalog/[id]`).
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DataTable, type DataTableColumn } from '../_shared/data-table';
import {
  PART_CATEGORIES,
  PART_CATEGORY_LABELS,
  formatQuantity,
  type PartCatalogRow,
  type PartCategory,
} from '@/lib/agentic-os/maker/catalog';

const API_BASE = '/api/tiresias/agentic-os/maker/catalog';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

interface Props {
  initialRows: PartCatalogRow[];
}

export function CatalogManager({ initialRows }: Props) {
  const [rows, setRows] = useState<PartCatalogRow[]>(initialRows);
  const [category, setCategory] = useState<PartCategory | ''>('');
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [newRow, setNewRow] = useState({
    name: '',
    category: 'other' as PartCategory,
    manufacturer: '',
    mfgPartNumber: '',
    unit: 'pcs',
    quantityOnHand: 0,
    tagsRaw: '',
  });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (search.trim()) params.set('search', search.trim());
    if (tag.trim()) params.set('tag', tag.trim());
    const r = await fetch(`${API_BASE}?${params.toString()}`);
    if (r.ok) {
      const { rows: rs } = await r.json();
      setRows(rs ?? []);
    }
  }, [category, search, tag]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addRow(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newRow.name.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const tags = newRow.tagsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
      const r = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRow.name.trim(),
          category: newRow.category,
          manufacturer: newRow.manufacturer.trim() || null,
          mfgPartNumber: newRow.mfgPartNumber.trim() || null,
          unit: newRow.unit.trim() || 'pcs',
          quantityOnHand: newRow.quantityOnHand,
          tags,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      await load();
      setNewRow({
        name: '',
        category: 'other',
        manufacturer: '',
        mfgPartNumber: '',
        unit: 'pcs',
        quantityOnHand: 0,
        tagsRaw: '',
      });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAdding(false);
    }
  }

  const columns: DataTableColumn<PartCatalogRow>[] = [
    {
      label: 'Name',
      render: (row) => (
        <div className="space-y-0.5">
          <Link
            href={`/dashboard/os/maker/catalog/${row.id}`}
            className="text-white hover:text-[#4361EE] transition font-medium"
          >
            {row.name}
          </Link>
          {row.manufacturer && (
            <div className="text-[10px] text-[#94a3b8]">
              {row.manufacturer}
              {row.mfgPartNumber ? ` · ${row.mfgPartNumber}` : ''}
            </div>
          )}
        </div>
      ),
    },
    {
      label: 'Category',
      render: (row) => (
        <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
          {PART_CATEGORY_LABELS[row.category]}
        </span>
      ),
    },
    {
      label: 'On hand',
      render: (row) => (
        <span
          className={`text-xs px-2 py-0.5 rounded border ${
            row.quantityOnHand > 0
              ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
              : 'text-[#94a3b8] bg-[#0f1117] border-[#2a2d3e]'
          }`}
        >
          {formatQuantity(row.quantityOnHand)} {row.unit}
        </span>
      ),
    },
    {
      label: 'Tags',
      render: (row) =>
        row.tags.length === 0 ? (
          <span className="text-[#94a3b8]">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.tags.map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]"
              >
                {t}
              </span>
            ))}
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="search"
          placeholder="Search name, manufacturer, MPN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputCls} max-w-sm`}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as PartCategory | '')}
          className={`${inputCls} max-w-[12rem]`}
        >
          <option value="">All categories</option>
          {PART_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter by tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className={`${inputCls} max-w-[12rem]`}
        />
      </div>

      {/* List */}
      <div className="rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-4">
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} empty="No catalog rows yet." />
      </div>

      {/* Create */}
      <form
        onSubmit={addRow}
        className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-4 space-y-3"
      >
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
          New catalog row
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
              Name
            </span>
            <input
              value={newRow.name}
              onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
              placeholder="e.g. NEMA 17 stepper motor"
              className={inputCls}
              required
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
              Category
            </span>
            <select
              value={newRow.category}
              onChange={(e) =>
                setNewRow({ ...newRow, category: e.target.value as PartCategory })
              }
              className={inputCls}
            >
              {PART_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
              Unit
            </span>
            <input
              value={newRow.unit}
              onChange={(e) => setNewRow({ ...newRow, unit: e.target.value })}
              placeholder="pcs / m / g"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
              Manufacturer
            </span>
            <input
              value={newRow.manufacturer}
              onChange={(e) => setNewRow({ ...newRow, manufacturer: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
              MPN
            </span>
            <input
              value={newRow.mfgPartNumber}
              onChange={(e) => setNewRow({ ...newRow, mfgPartNumber: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
              On hand
            </span>
            <input
              type="number"
              min={0}
              step="any"
              value={newRow.quantityOnHand}
              onChange={(e) =>
                setNewRow({ ...newRow, quantityOnHand: Number(e.target.value) })
              }
              className={inputCls}
            />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
            Tags (comma-separated)
          </span>
          <input
            value={newRow.tagsRaw}
            onChange={(e) => setNewRow({ ...newRow, tagsRaw: e.target.value })}
            placeholder="motor, 3d-printer, gantry"
            className={inputCls}
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={adding || !newRow.name.trim()}
            className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
          >
            {adding ? 'Adding…' : 'Create catalog row'}
          </button>
          {addError && <span className="text-sm text-red-300">{addError}</span>}
        </div>
      </form>
    </div>
  );
}
