/**
 * Business OS Phase 4 — line item inline row editor.
 *
 * Wave D (UI Depth Wave) polish: migrated the hand-spelled hex / `text-white`
 * / `bg-teal-600` literals onto the visual-language tokens (text hierarchy,
 * `danger` status token, `os-business` accent for the add button). Same
 * fields, same submit payload, same routes — presentation only.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

'use client';

import { useId, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

type ParentType = 'quote' | 'invoice';

interface Props {
  parentType: ParentType;
  parentId: string;
  onSuccess?: () => void;
  initialValues?: {
    id?: string;
    description?: string;
    quantity?: number;
    unitLabel?: string;
    unitPriceCents?: number;
    taxRateBp?: number;
  };
}

export default function LineItemForm({
  parentType,
  parentId,
  onSuccess,
  initialValues,
}: Props) {
  const router = useRouter();
  const isEdit = !!initialValues?.id;

  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [quantity, setQuantity] = useState(initialValues?.quantity ?? 1);
  const [unitLabel, setUnitLabel] = useState(initialValues?.unitLabel ?? '');
  const [unitPriceCents, setUnitPriceCents] = useState(initialValues?.unitPriceCents ?? 0);
  const [taxRateBp, setTaxRateBp] = useState(initialValues?.taxRateBp ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

  const lineTotal = useMemo(() => Math.round(quantity * unitPriceCents), [quantity, unitPriceCents]);
  const lineTax = useMemo(() => Math.round((lineTotal * taxRateBp) / 10000), [lineTotal, taxRateBp]);
  const grandTotal = lineTotal + lineTax;

  const fmtCents = (c: number) =>
    `$${(c / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      const body: Record<string, unknown> = {
        description,
        quantity,
        unit_label: unitLabel,
        unit_price_cents: unitPriceCents,
        tax_rate_bp: taxRateBp,
      };

      try {
        const baseUrl = `/api/tiresias/agentic-os/business/${parentType}s/${parentId}/line-items`;
        const url = isEdit ? `${baseUrl}/${initialValues!.id}` : baseUrl;
        const method = isEdit ? 'PATCH' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError(err.error || 'Request failed');
          return;
        }

        onSuccess?.();
        router.refresh();
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    },
    [description, quantity, unitLabel, unitPriceCents, taxRateBp, parentType, parentId, isEdit, initialValues, onSuccess, router],
  );

  const inputClass =
    'rounded-md border border-border-subtle bg-surface-0 px-2 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none transition';
  const labelClass = 'block text-2xs text-text-tertiary mb-0.5';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-2">
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-start">
        <div className="flex-1 min-w-[120px]">
          <label htmlFor={fid('description')} className={labelClass}>Description *</label>
          <input
            id={fid('description')}
            className={inputClass + ' w-full'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Line item description"
            required
          />
        </div>
        <div className="w-16">
          <label htmlFor={fid('qty')} className={labelClass}>Qty</label>
          <input
            id={fid('qty')}
            className={inputClass + ' w-full text-center'}
            type="number"
            min={0.01}
            step={0.01}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </div>
        <div className="w-20">
          <label htmlFor={fid('unit')} className={labelClass}>Unit</label>
          <input
            id={fid('unit')}
            className={inputClass + ' w-full'}
            value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value)}
            placeholder="hour"
          />
        </div>
        <div className="w-28">
          <label htmlFor={fid('price')} className={labelClass}>Price (cents)</label>
          <input
            id={fid('price')}
            className={inputClass + ' w-full text-right'}
            type="number"
            min={0}
            value={unitPriceCents}
            onChange={(e) => setUnitPriceCents(Number(e.target.value))}
          />
        </div>
        <div className="w-20">
          <label htmlFor={fid('tax')} className={labelClass}>Tax (bp)</label>
          <input
            id={fid('tax')}
            className={inputClass + ' w-full text-right'}
            type="number"
            min={0}
            max={10000}
            value={taxRateBp}
            onChange={(e) => setTaxRateBp(Number(e.target.value))}
          />
        </div>
        <div className="w-24 text-right self-end">
          <p className="text-xs tabular-nums text-text-tertiary">{fmtCents(lineTotal)}</p>
          {taxRateBp > 0 && (
            <p className="text-2xs tabular-nums text-text-secondary">+{fmtCents(lineTax)} tax</p>
          )}
          <p className="font-mono text-xs tabular-nums text-text-primary">{fmtCents(grandTotal)}</p>
        </div>
        <div className="self-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center rounded-md bg-os-business/15 text-os-business hover:bg-os-business/25 disabled:opacity-50 text-xs font-medium px-3 py-1.5 transition"
          >
            {loading ? '...' : isEdit ? 'Update' : 'Add'}
          </button>
        </div>
      </div>
    </form>
  );
}
