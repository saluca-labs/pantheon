/**
 * Business OS Phase 4 — line item inline row editor.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
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
    'rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-2 py-1.5 text-xs text-white placeholder-[#64748b] focus:border-[#4361EE] focus:outline-none';
  const labelClass = 'block text-[10px] text-[#64748b] mb-0.5';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="rounded border border-red-800 bg-red-900/20 p-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-start">
        <div className="flex-1 min-w-[120px]">
          <label className={labelClass}>Description *</label>
          <input
            className={inputClass + ' w-full'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Line item description"
            required
          />
        </div>
        <div className="w-16">
          <label className={labelClass}>Qty</label>
          <input
            className={inputClass + ' w-full text-center'}
            type="number"
            min={0.01}
            step={0.01}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </div>
        <div className="w-20">
          <label className={labelClass}>Unit</label>
          <input
            className={inputClass + ' w-full'}
            value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value)}
            placeholder="hour"
          />
        </div>
        <div className="w-28">
          <label className={labelClass}>Price (cents)</label>
          <input
            className={inputClass + ' w-full text-right'}
            type="number"
            min={0}
            value={unitPriceCents}
            onChange={(e) => setUnitPriceCents(Number(e.target.value))}
          />
        </div>
        <div className="w-20">
          <label className={labelClass}>Tax (bp)</label>
          <input
            className={inputClass + ' w-full text-right'}
            type="number"
            min={0}
            max={10000}
            value={taxRateBp}
            onChange={(e) => setTaxRateBp(Number(e.target.value))}
          />
        </div>
        <div className="w-24 text-right self-end">
          <p className="text-xs text-[#64748b]">{fmtCents(lineTotal)}</p>
          {taxRateBp > 0 && <p className="text-[10px] text-[#94a3b8]">+{fmtCents(lineTax)} tax</p>}
          <p className="text-xs font-mono text-white">{fmtCents(grandTotal)}</p>
        </div>
        <div className="self-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 transition-colors"
          >
            {loading ? '...' : isEdit ? 'Update' : 'Add'}
          </button>
        </div>
      </div>
    </form>
  );
}
