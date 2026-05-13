/**
 * Business OS Phase 5 — expense form (create + edit).
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { EXPENSE_CATEGORIES } from '@/lib/agentic-os/business/expenses';
import type { ExpenseCategory } from '@/lib/agentic-os/business/expenses';

interface ProjectOption {
  id: string;
  title: string;
}

interface Props {
  projects?: ProjectOption[];
  initialValues?: {
    id?: string;
    projectId?: string | null;
    category?: ExpenseCategory;
    vendor?: string | null;
    description?: string;
    amountCents?: number;
    currency?: string;
    incurredOn?: string;
    paidOn?: string | null;
    receiptUrl?: string | null;
    isReimbursable?: boolean;
    tags?: string[];
  };
  onSuccess?: () => void;
  compact?: boolean;
}

export default function ExpenseForm({
  projects = [],
  initialValues,
  onSuccess,
  compact = false,
}: Props) {
  const router = useRouter();
  const isEdit = !!initialValues?.id;

  const [category, setCategory] = useState<ExpenseCategory>(initialValues?.category ?? 'general');
  const [vendor, setVendor] = useState(initialValues?.vendor ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [amountDollars, setAmountDollars] = useState(
    initialValues?.amountCents ? String(initialValues.amountCents / 100) : '',
  );
  const [currency, setCurrency] = useState(initialValues?.currency ?? 'USD');
  const [incurredOn, setIncurredOn] = useState(
    initialValues?.incurredOn ?? new Date().toISOString().slice(0, 10),
  );
  const [paidOn, setPaidOn] = useState(initialValues?.paidOn ?? '');
  const [receiptUrl, setReceiptUrl] = useState(initialValues?.receiptUrl ?? '');
  const [isReimbursable, setIsReimbursable] = useState(initialValues?.isReimbursable ?? false);
  const [projectId, setProjectId] = useState(initialValues?.projectId ?? '');
  const [tagsStr, setTagsStr] = useState((initialValues?.tags ?? []).join(', '));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      const dollarAmount = parseFloat(amountDollars);
      if (isNaN(dollarAmount) || dollarAmount <= 0) {
        setError('Amount must be a positive number');
        setLoading(false);
        return;
      }
      const amountCents = Math.round(dollarAmount * 100);
      const tags = tagsStr
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const body: Record<string, unknown> = {
        category,
        vendor: vendor || null,
        description,
        amount_cents: amountCents,
        currency,
        incurred_on: incurredOn,
        paid_on: paidOn || null,
        receipt_url: receiptUrl || null,
        is_reimbursable: isReimbursable,
        project_id: projectId || null,
        tags,
      };

      try {
        const url = isEdit
          ? `/api/tiresias/agentic-os/business/expenses/${initialValues!.id}`
          : '/api/tiresias/agentic-os/business/expenses';
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
    [
      category, vendor, description, amountDollars, currency,
      incurredOn, paidOn, receiptUrl, isReimbursable, projectId,
      tagsStr, isEdit, initialValues, onSuccess, router,
    ],
  );

  const inputClass =
    'w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#4361EE] focus:outline-none';
  const selectClass = inputClass;
  const labelClass = 'block text-xs text-[#94a3b8] mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!compact && (
        <h2 className="text-lg font-medium text-white">
          {isEdit ? 'Edit Expense' : 'New Expense'}
        </h2>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className={compact ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        <div>
          <label className={labelClass}>Category</label>
          <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Vendor</label>
          <input
            className={inputClass}
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="AWS, WeWork, etc."
          />
        </div>
        <div>
          <label className={labelClass}>Description</label>
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="March cloud hosting bill"
          />
        </div>
        <div>
          <label className={labelClass}>Amount (USD) *</label>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            min="0.01"
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
            placeholder="29.99"
            required
          />
        </div>
        <div>
          <label className={labelClass}>Currency</label>
          <input
            className={inputClass}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={8}
          />
        </div>
        <div>
          <label className={labelClass}>Incurred On *</label>
          <input
            className={inputClass}
            type="date"
            value={incurredOn}
            onChange={(e) => setIncurredOn(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Paid On</label>
          <input
            className={inputClass}
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Receipt URL</label>
          <input
            className={inputClass}
            value={receiptUrl}
            onChange={(e) => setReceiptUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className={labelClass}>Project</label>
          <select className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">-- None --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Tags</label>
          <input
            className={inputClass}
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            placeholder="q1, ops, cloud (comma separated)"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="isReimbursable"
          type="checkbox"
          checked={isReimbursable}
          onChange={(e) => setIsReimbursable(e.target.checked)}
          className="rounded border-[#2a2d3e] bg-[#0f1117] text-[#4361EE] focus:ring-[#4361EE]"
        />
        <label htmlFor="isReimbursable" className="text-sm text-[#94a3b8]">
          Reimbursable expense
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors"
      >
        {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Expense'}
      </button>
    </form>
  );
}
