'use client';

/**
 * Maker OS — CatalogDetail.
 *
 * Per-row detail view: editable header (name, manufacturer, on-hand, tags),
 * variants table, supplier-links table, and a list of projects whose BOM
 * touches this catalog row. Variants + supplier-links subforms are sibling
 * components composed here.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trash2, ExternalLink, ShoppingBag } from 'lucide-react';
import {
  PART_CATEGORIES,
  PART_CATEGORY_LABELS,
  formatQuantity,
  type PartCatalogRow,
  type PartCategory,
  type PartVariant,
} from '@/lib/agentic-os/maker/catalog';
import {
  formatPrice,
  type PartSupplierLink,
  type Supplier,
} from '@/lib/agentic-os/maker/suppliers';
import { VariantEditor } from './variant-editor';

const API_BASE = '/api/tiresias/agentic-os/maker';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

interface ProjectUsage {
  id: string;
  name: string;
  status: string;
  quantityNeeded: number;
}

interface Props {
  row: PartCatalogRow;
  initialVariants: PartVariant[];
  initialLinks: PartSupplierLink[];
  suppliers: Supplier[];
  usage: ProjectUsage[];
}

export function CatalogDetail({
  row: initialRow,
  initialVariants,
  initialLinks,
  suppliers,
  usage,
}: Props) {
  const [row, setRow] = useState<PartCatalogRow>(initialRow);
  const [variants, setVariants] = useState<PartVariant[]>(initialVariants);
  const [links, setLinks] = useState<PartSupplierLink[]>(initialLinks);
  const [savingHeader, setSavingHeader] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);

  const refreshLinks = useCallback(async () => {
    const r = await fetch(`${API_BASE}/catalog/${row.id}/suppliers`);
    if (r.ok) {
      const { links: ls } = await r.json();
      setLinks(ls ?? []);
    }
  }, [row.id]);

  const refreshVariants = useCallback(async () => {
    const r = await fetch(`${API_BASE}/catalog/${row.id}/variants`);
    if (r.ok) {
      const { variants: vs } = await r.json();
      setVariants(vs ?? []);
    }
  }, [row.id]);

  useEffect(() => {
    void refreshLinks();
    void refreshVariants();
  }, [refreshLinks, refreshVariants]);

  async function saveHeader(patch: Partial<PartCatalogRow>) {
    setSavingHeader(true);
    setHeaderError(null);
    try {
      const r = await fetch(`${API_BASE}/catalog/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { row: updated } = await r.json();
      if (updated) setRow(updated);
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSavingHeader(false);
    }
  }

  async function addLink(supplierId: string, unitPriceCents: number | null) {
    await fetch(`${API_BASE}/catalog/${row.id}/suppliers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId, unitPriceCents }),
    });
    await refreshLinks();
  }

  async function removeLink(linkId: string) {
    await fetch(`${API_BASE}/catalog/${row.id}/suppliers?linkId=${linkId}`, {
      method: 'DELETE',
    });
    await refreshLinks();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/dashboard/os/maker/catalog"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-2 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to catalog
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6 space-y-4">
        <div className="flex items-start gap-4">
          {row.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.imageUrl}
              alt={row.name}
              className="w-24 h-24 rounded-lg object-cover border border-border-subtle"
            />
          ) : (
            <div className="w-24 h-24 rounded-lg border border-dashed border-border-subtle flex items-center justify-center">
              <ShoppingBag className="w-8 h-8 text-accent/40" />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <input
              value={row.name}
              onChange={(e) => setRow({ ...row, name: e.target.value })}
              onBlur={() => {
                if (row.name !== initialRow.name) void saveHeader({ name: row.name });
              }}
              className={`${inputCls} text-lg font-semibold`}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">
                  Category
                </span>
                <select
                  value={row.category}
                  onChange={(e) => {
                    const cat = e.target.value as PartCategory;
                    setRow({ ...row, category: cat });
                    void saveHeader({ category: cat });
                  }}
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
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">
                  Manufacturer
                </span>
                <input
                  value={row.manufacturer ?? ''}
                  onChange={(e) => setRow({ ...row, manufacturer: e.target.value })}
                  onBlur={() =>
                    void saveHeader({ manufacturer: row.manufacturer ?? null })
                  }
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">
                  MPN
                </span>
                <input
                  value={row.mfgPartNumber ?? ''}
                  onChange={(e) => setRow({ ...row, mfgPartNumber: e.target.value })}
                  onBlur={() =>
                    void saveHeader({ mfgPartNumber: row.mfgPartNumber ?? null })
                  }
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">
                  Unit
                </span>
                <input
                  value={row.unit}
                  onChange={(e) => setRow({ ...row, unit: e.target.value })}
                  onBlur={() => void saveHeader({ unit: row.unit })}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">
                  On hand
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={row.quantityOnHand}
                  onChange={(e) =>
                    setRow({ ...row, quantityOnHand: Number(e.target.value) })
                  }
                  onBlur={() => void saveHeader({ quantityOnHand: row.quantityOnHand })}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">
                  Datasheet URL
                </span>
                <input
                  type="url"
                  value={row.datasheetUrl ?? ''}
                  onChange={(e) => setRow({ ...row, datasheetUrl: e.target.value })}
                  onBlur={() =>
                    void saveHeader({ datasheetUrl: row.datasheetUrl || null })
                  }
                  placeholder="https://…"
                  className={inputCls}
                />
              </label>
            </div>
            {savingHeader && (
              <p className="text-xs text-text-secondary">Saving…</p>
            )}
            {headerError && <p className="text-xs text-danger">{headerError}</p>}
          </div>
        </div>
        <div className="text-xs text-text-secondary flex flex-wrap items-center gap-4">
          <span>{PART_CATEGORY_LABELS[row.category]}</span>
          <span>·</span>
          <span>
            {formatQuantity(row.quantityOnHand)} {row.unit} on hand
          </span>
          {row.datasheetUrl && (
            <a
              href={row.datasheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Datasheet
            </a>
          )}
        </div>
      </div>

      {/* Variants */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
          Variants
        </h2>
        <p className="text-xs text-text-secondary">
          Optional — ship empty if this row has no size/colour/finish variants.
        </p>
        <VariantEditor
          catalogId={row.id}
          initialVariants={variants}
          onChange={(updated) => setVariants(updated)}
        />
      </div>

      {/* Supplier links */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
          Supplier links
        </h2>
        {links.length === 0 ? (
          <p className="text-sm text-text-secondary">No supplier quotes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
                  <th className="py-2 pr-4 font-normal">Supplier</th>
                  <th className="py-2 pr-4 font-normal">Unit price</th>
                  <th className="py-2 pr-4 font-normal">Lead time</th>
                  <th className="py-2 pr-4 font-normal">URL</th>
                  <th className="py-2 pr-4 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => {
                  const supplier = suppliers.find((s) => s.id === l.supplierId);
                  return (
                    <tr key={l.id} className="border-t border-border-subtle">
                      <td className="py-2 pr-4 text-white">
                        {supplier?.name ?? l.supplierId.slice(0, 8)}
                      </td>
                      <td className="py-2 pr-4 text-text-primary">
                        {formatPrice(l.unitPriceCents, l.currency)}
                      </td>
                      <td className="py-2 pr-4 text-text-secondary">
                        {l.leadTimeDays == null ? '—' : `${l.leadTimeDays}d`}
                      </td>
                      <td className="py-2 pr-4">
                        {l.url ? (
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-accent hover:underline text-xs"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open
                          </a>
                        ) : (
                          <span className="text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          onClick={() => void removeLink(l.id)}
                          className="text-xs text-text-secondary hover:text-danger transition"
                          aria-label="Remove supplier link"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <AddLinkForm suppliers={suppliers} onAdd={addLink} />
      </div>

      {/* Project usage */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
          Used by projects
        </h2>
        {usage.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No project BOM references this row yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {usage.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between text-sm border-b border-border-subtle/40 last:border-0 py-1.5"
              >
                <Link
                  href={`/dashboard/os/maker/projects/${u.id}?tab=bom`}
                  className="text-white hover:text-accent transition"
                >
                  {u.name}
                </Link>
                <span className="text-xs text-text-secondary">
                  {u.status} · {formatQuantity(u.quantityNeeded)} {row.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddLinkForm({
  suppliers,
  onAdd,
}: {
  suppliers: Supplier[];
  onAdd: (supplierId: string, unitPriceCents: number | null) => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id ?? '');
  const [unitPriceCents, setUnitPriceCents] = useState<string>('');
  const [busy, setBusy] = useState(false);

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        No suppliers yet.{' '}
        <Link href="/dashboard/os/maker/suppliers" className="text-accent hover:underline">
          Add a supplier first
        </Link>
        .
      </p>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!supplierId) return;
        setBusy(true);
        const cents = unitPriceCents ? Number(unitPriceCents) : null;
        await onAdd(supplierId, Number.isFinite(cents) ? cents : null);
        setUnitPriceCents('');
        setBusy(false);
      }}
      className="flex flex-wrap gap-3 pt-3 border-t border-border-subtle"
    >
      <select
        value={supplierId}
        onChange={(e) => setSupplierId(e.target.value)}
        className={`${inputCls} max-w-[14rem]`}
      >
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        step={1}
        placeholder="Unit price (cents)"
        value={unitPriceCents}
        onChange={(e) => setUnitPriceCents(e.target.value)}
        className={`${inputCls} max-w-[12rem]`}
      />
      <button
        type="submit"
        disabled={busy || !supplierId}
        className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
      >
        {busy ? 'Adding…' : 'Add link'}
      </button>
    </form>
  );
}
