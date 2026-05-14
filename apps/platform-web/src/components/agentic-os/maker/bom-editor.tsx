'use client';

/**
 * Maker OS — BomEditor.
 *
 * The BOM tab on the per-project Project Hub. Renders the per-line summary
 * (needed / on-hand / free / deficit / est_cost) and an inline form to add
 * new lines (pick a catalog row, set quantity_needed + priority).
 *
 * Wave C used the shared `_shared/data-table.tsx` for the line list.
 *
 * Wave D.4 — BOM editor depth (no API / query changes; the `BomSummary`
 * shape is untouched):
 *  - The flat `DataTable` of lines is replaced by a richer per-line card
 *    grid: each row leads with a sourcing-status pill (in-stock / short /
 *    critical-short / no-stock-data) derived purely from the existing
 *    `deficit` / `free` fields, the part name links into the catalog, and
 *    the needed-quantity input + priority select are inline as before.
 *  - A totals summary block at the top is upgraded from a flat text strip
 *    into a labelled stat grid (lines, est. cost, deficit, critical-short),
 *    each cell tinted by severity.
 *  - Sourcing: each line surfaces whether a priced supplier link backed the
 *    est-cost (`cheapestLinkId`) — an "estimated" vs "no quote" sourcing
 *    hint — so a maker can see at a glance which lines still need a price.
 *  - The add-line form is unchanged.
 *
 * @license MIT — Tiresias Maker OS Phase 2 + Wave D.4 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  PackageCheck,
  PackageX,
  AlertTriangle,
  CircleSlash,
  Tag,
  Trash2,
} from 'lucide-react';
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

/**
 * Sourcing-status taxonomy for one BOM line — derived purely from the
 * existing summary fields, no new query. Drives the per-line status pill.
 *
 *   in_stock   — needed quantity is fully covered by free stock.
 *   short      — a deficit exists but the line is not marked critical.
 *   critical   — a deficit exists AND the line priority is `critical`.
 *   no_data    — there is no free stock at all to draw against.
 */
type SourcingStatus = 'in_stock' | 'short' | 'critical' | 'no_data';

function sourcingStatus(row: BomSummaryRow): SourcingStatus {
  if (row.deficit > 0) {
    return row.line.priority === 'critical' ? 'critical' : 'short';
  }
  if (row.free <= 0 && row.onHand <= 0) return 'no_data';
  return 'in_stock';
}

const STATUS_META: Record<
  SourcingStatus,
  { label: string; pill: string; Icon: typeof PackageCheck }
> = {
  in_stock: {
    label: 'In stock',
    pill: 'border-emerald-500/50 text-emerald-300 bg-emerald-500/5',
    Icon: PackageCheck,
  },
  short: {
    label: 'Short',
    pill: 'border-amber-500/50 text-amber-300 bg-amber-500/5',
    Icon: AlertTriangle,
  },
  critical: {
    label: 'Critical short',
    pill: 'border-red-500/50 text-red-300 bg-red-500/5',
    Icon: PackageX,
  },
  no_data: {
    label: 'No stock data',
    pill: 'border-border-subtle text-text-secondary bg-surface-0',
    Icon: CircleSlash,
  },
};

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

  // Sourcing rollup — how many lines still lack a priced supplier link.
  const unsourcedLines = useMemo(
    () => summary.rows.filter((r) => r.cheapestLinkId == null).length,
    [summary.rows],
  );

  return (
    <div className="space-y-5">
      {/* Totals — labelled stat grid, severity-tinted */}
      <div
        data-testid="bom-totals"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <TotalCell label="Lines" value={String(summary.linesCount)} />
        <TotalCell
          label="Est. cost"
          value={formatPrice(summary.totalEstCostCents, summary.currency)}
        />
        <TotalCell
          label="Deficit"
          value={
            summary.totalDeficit > 0
              ? formatQuantity(summary.totalDeficit)
              : '0'
          }
          tone={summary.totalDeficit > 0 ? 'warning' : 'ok'}
        />
        <TotalCell
          label="Critical short"
          value={String(summary.criticalDeficitLines)}
          tone={summary.criticalDeficitLines > 0 ? 'danger' : 'ok'}
        />
      </div>

      {unsourcedLines > 0 && summary.linesCount > 0 && (
        <p
          data-testid="bom-sourcing-hint"
          className="flex items-center gap-1.5 text-xs text-text-secondary"
        >
          <Tag className="h-3.5 w-3.5" />
          <span className="tabular-nums text-text-primary">
            {unsourcedLines}
          </span>{' '}
          {unsourcedLines === 1 ? 'line has' : 'lines have'} no priced supplier
          link yet — est. cost excludes them.
        </p>
      )}

      {/* Lines — per-line card grid with sourcing-status pills */}
      {summary.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-subtle bg-surface-2/40 p-6 text-center text-sm text-text-secondary">
          No BOM lines yet. Add one below.
        </div>
      ) : (
        <ul data-testid="bom-line-list" className="space-y-2">
          {summary.rows.map((row) => {
            const status = sourcingStatus(row);
            const meta = STATUS_META[status];
            const StatusIcon = meta.Icon;
            return (
              <li
                key={row.line.id}
                data-testid={`bom-line-${row.line.id}`}
                className="rounded-lg border border-border-subtle bg-surface-2 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        data-testid={`bom-line-status-${row.line.id}`}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.pill}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {meta.label}
                      </span>
                      <Link
                        href={`/dashboard/os/maker/catalog/${row.catalog.id}`}
                        className="font-medium text-white transition hover:text-accent"
                      >
                        {row.catalog.name}
                      </Link>
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-text-secondary">
                      {row.catalog.category}
                      {row.variant ? ` · ${row.variant.variantLabel}` : ''}
                    </div>
                    {/* Sourcing hint per line */}
                    <div className="text-[10px] text-text-secondary">
                      {row.cheapestLinkId
                        ? `Est. ${formatPrice(row.estCostCents, row.currency)} at cheapest supplier`
                        : 'No priced supplier link — add one in the catalog'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void removeLine(row.line)}
                    className="rounded p-1 text-text-secondary transition hover:bg-red-500/10 hover:text-red-300"
                    aria-label="Remove BOM line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Quantity facts + inline editors */}
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-secondary">
                      Needed
                    </span>
                    <input
                      type="number"
                      min={0.001}
                      step="any"
                      defaultValue={row.needed}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v > 0 && v !== row.needed) void changeQty(row.line, v);
                      }}
                      className={inputCls}
                      aria-label={`Quantity needed for ${row.catalog.name}`}
                    />
                  </label>
                  <Fact label="On hand" value={formatQuantity(row.onHand)} />
                  <Fact label="Free" value={formatQuantity(row.free)} />
                  <Fact
                    label="Deficit"
                    value={
                      row.deficit > 0 ? formatQuantity(row.deficit) : '0'
                    }
                    tone={row.deficit > 0 ? 'warning' : 'ok'}
                  />
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-secondary">
                      Priority
                    </span>
                    <select
                      value={row.line.priority}
                      onChange={(e) =>
                        void changePriority(
                          row.line,
                          e.target.value as BomPriority,
                        )
                      }
                      className={inputCls}
                      aria-label={`Priority for ${row.catalog.name}`}
                    >
                      {BOM_PRIORITY_VALUES.map((p) => (
                        <option key={p} value={p}>
                          {BOM_PRIORITY_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}

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

/** A labelled cell in the BOM totals stat grid. */
function TotalCell({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'ok' | 'warning' | 'danger';
}) {
  const valueTone =
    tone === 'warning'
      ? 'text-amber-300'
      : tone === 'danger'
        ? 'text-red-300'
        : tone === 'ok'
          ? 'text-emerald-300'
          : 'text-white';
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2 p-3">
      <div className="text-[10px] uppercase tracking-wide text-text-secondary">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${valueTone}`}>
        {value}
      </div>
    </div>
  );
}

/** A small read-only quantity fact inside a BOM line card. */
function Fact({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'ok' | 'warning';
}) {
  const valueTone =
    tone === 'warning'
      ? 'text-amber-300'
      : tone === 'ok'
        ? 'text-emerald-300'
        : 'text-white';
  return (
    <div className="flex flex-col justify-end">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-secondary">
        {label}
      </span>
      <span className={`text-sm font-medium tabular-nums ${valueTone}`}>
        {value}
      </span>
    </div>
  );
}
