'use client';

/**
 * Maker OS — BomEditor.
 *
 * The BOM tab on the per-project Project Hub. Replaces the Phase 1
 * ProjectPartsManager. Renders the per-line summary (needed / on-hand / free /
 * deficit / est_cost) using the shared `_shared/data-table.tsx` primitive and
 * exposes a small inline form to add new lines (pick a catalog row, set
 * quantity_needed + priority).
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DataTable, type DataTableColumn } from '../_shared/data-table';
import {
  BOM_PRIORITY_VALUES,
  BOM_PRIORITY_LABELS,
  type BomLine,
  type BomPriority,
  type BomSummary,
  type BomSummaryRow,
} from '@/lib/agentic-os/maker/bom';
import { formatQuantity, type PartCatalogRow } from '@/lib/agentic-os/maker/catalog';
import { formatPrice } from '@/lib/agentic-os/maker/suppliers';

const API_BASE = '/api/tiresias/agentic-os/maker';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

interface Props {
  projectId: string;
  initialSummary: BomSummary;
  catalogRows: PartCatalogRow[];
}

export function BomEditor({ projectId, initialSummary, catalogRows }: Props) {
  const [summary, setSummary] = useState<BomSummary>(initialSummary);
  const [catalog, setCatalog] = useState<PartCatalogRow[]>(catalogRows);
  const [newLine, setNewLine] = useState({
    partCatalogId: catalogRows[0]?.id ?? '',
    quantityNeeded: 1,
    priority: 'normal' as BomPriority,
    notes: '',
  });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const refreshSummary = useCallback(async () => {
    const r = await fetch(`${API_BASE}/projects/${projectId}/bom-summary`);
    if (r.ok) {
      const { summary: s } = await r.json();
      if (s) setSummary(s);
    }
  }, [projectId]);

  const refreshCatalog = useCallback(async () => {
    const r = await fetch(`${API_BASE}/catalog`);
    if (r.ok) {
      const { rows } = await r.json();
      setCatalog(rows ?? []);
    }
  }, []);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  const catalogById = useMemo(() => {
    const m = new Map<string, PartCatalogRow>();
    for (const c of catalog) m.set(c.id, c);
    return m;
  }, [catalog]);

  async function addLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newLine.partCatalogId) {
      setAddError('Pick a catalog row first.');
      return;
    }
    if (!(newLine.quantityNeeded > 0)) {
      setAddError('Quantity must be positive.');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/bom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partCatalogId: newLine.partCatalogId,
          quantityNeeded: newLine.quantityNeeded,
          priority: newLine.priority,
          notes: newLine.notes.trim() || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      setNewLine((prev) => ({ ...prev, quantityNeeded: 1, notes: '' }));
      await refreshSummary();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAdding(false);
    }
  }

  async function removeLine(line: BomLine) {
    await fetch(`${API_BASE}/projects/${projectId}/bom/${line.id}`, {
      method: 'DELETE',
    });
    await refreshSummary();
  }

  async function changeQty(line: BomLine, qty: number) {
    if (!(qty > 0)) return;
    await fetch(`${API_BASE}/projects/${projectId}/bom/${line.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantityNeeded: qty }),
    });
    await refreshSummary();
  }

  async function changePriority(line: BomLine, priority: BomPriority) {
    await fetch(`${API_BASE}/projects/${projectId}/bom/${line.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    });
    await refreshSummary();
  }

  const columns: DataTableColumn<BomSummaryRow>[] = [
    {
      label: 'Part',
      render: (row) => (
        <div className="space-y-0.5">
          <Link
            href={`/dashboard/os/maker/catalog/${row.catalog.id}`}
            className="text-white hover:text-accent transition font-medium"
          >
            {row.catalog.name}
          </Link>
          <div className="text-[10px] text-text-secondary uppercase tracking-wide">
            {row.catalog.category}
            {row.variant ? ` · ${row.variant.variantLabel}` : ''}
          </div>
        </div>
      ),
    },
    {
      label: 'Needed',
      render: (row) => (
        <input
          type="number"
          min={0.001}
          step="any"
          defaultValue={row.needed}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v > 0 && v !== row.needed) void changeQty(row.line, v);
          }}
          className={`${inputCls} w-24`}
        />
      ),
    },
    {
      label: 'On hand',
      render: (row) => formatQuantity(row.onHand),
    },
    {
      label: 'Free',
      render: (row) => formatQuantity(row.free),
    },
    {
      label: 'Deficit',
      render: (row) =>
        row.deficit > 0 ? (
          <span className="text-amber-300">{formatQuantity(row.deficit)}</span>
        ) : (
          <span className="text-emerald-300">0</span>
        ),
    },
    {
      label: 'Priority',
      render: (row) => (
        <select
          value={row.line.priority}
          onChange={(e) => void changePriority(row.line, e.target.value as BomPriority)}
          className={`${inputCls} w-28`}
        >
          {BOM_PRIORITY_VALUES.map((p) => (
            <option key={p} value={p}>
              {BOM_PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      ),
    },
    {
      label: 'Est. cost',
      render: (row) => formatPrice(row.estCostCents, row.currency),
    },
    {
      label: '',
      render: (row) => (
        <button
          type="button"
          onClick={() => void removeLine(row.line)}
          className="text-xs text-text-secondary hover:text-red-300 transition"
          aria-label="Remove BOM line"
        >
          Remove
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Totals */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-text-secondary">{summary.linesCount} lines</span>
        <span className="text-text-primary">
          Total: {formatPrice(summary.totalEstCostCents, summary.currency)}
        </span>
        {summary.totalDeficit > 0 && (
          <span className="text-amber-300">
            Deficit {formatQuantity(summary.totalDeficit)}
          </span>
        )}
        {summary.criticalDeficitLines > 0 && (
          <span className="text-red-300">
            {summary.criticalDeficitLines} critical short
          </span>
        )}
      </div>

      {/* Lines */}
      <div className="rounded-lg border border-border-subtle bg-surface-2 p-4">
        <DataTable
          rows={summary.rows}
          columns={columns}
          rowKey={(row) => row.line.id}
          empty="No BOM lines yet. Add one below."
        />
      </div>

      {/* Add line */}
      <form
        onSubmit={addLine}
        className="rounded-lg border border-border-subtle bg-surface-0 p-4 space-y-3"
      >
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Add line
        </h4>
        {catalog.length === 0 ? (
          <div className="text-sm text-text-secondary">
            No catalog rows yet.{' '}
            <Link href="/dashboard/os/maker/catalog" className="text-accent hover:underline">
              Create one in the catalog
            </Link>
            , then come back here.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <label className="block sm:col-span-2">
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                  Catalog row
                </span>
                <select
                  value={newLine.partCatalogId}
                  onChange={(e) =>
                    setNewLine({ ...newLine, partCatalogId: e.target.value })
                  }
                  className={inputCls}
                  required
                >
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.category})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                  Quantity
                </span>
                <input
                  type="number"
                  min={0.001}
                  step="any"
                  value={newLine.quantityNeeded}
                  onChange={(e) =>
                    setNewLine({ ...newLine, quantityNeeded: Number(e.target.value) })
                  }
                  className={inputCls}
                  required
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                  Priority
                </span>
                <select
                  value={newLine.priority}
                  onChange={(e) =>
                    setNewLine({ ...newLine, priority: e.target.value as BomPriority })
                  }
                  className={inputCls}
                >
                  {BOM_PRIORITY_VALUES.map((p) => (
                    <option key={p} value={p}>
                      {BOM_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Notes (optional)
              </span>
              <input
                value={newLine.notes}
                onChange={(e) => setNewLine({ ...newLine, notes: e.target.value })}
                placeholder="e.g. for the gantry stage"
                className={inputCls}
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={adding || !newLine.partCatalogId}
                className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
              >
                {adding ? 'Adding…' : 'Add line'}
              </button>
              <button
                type="button"
                onClick={() => void refreshCatalog()}
                className="text-xs text-text-secondary hover:text-white transition"
              >
                Refresh catalog
              </button>
              {addError && <span className="text-sm text-red-300">{addError}</span>}
            </div>
          </>
        )}
      </form>
    </div>
  );
}
