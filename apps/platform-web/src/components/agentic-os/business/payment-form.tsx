/**
 * Business OS Phase 4 — payment form.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

'use client';

import { useId, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const METHOD_OPTIONS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'check', label: 'Check' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'wire', label: 'Wire' },
  { value: 'other', label: 'Other' },
];

interface Props {
  invoiceId: string;
  onSuccess?: () => void;
}

export default function PaymentForm({ invoiceId, onSuccess }: Props) {
  const router = useRouter();

  const [amountCents, setAmountCents] = useState(0);
  const [method, setMethod] = useState('bank_transfer');
  const [receivedOn, setReceivedOn] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      try {
        const res = await fetch(
          `/api/tiresias/agentic-os/business/invoices/${invoiceId}/payments`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount_cents: amountCents,
              method,
              received_on: receivedOn,
              reference: reference || null,
              notes: notes || null,
            }),
          },
        );

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
    [amountCents, method, receivedOn, reference, notes, invoiceId, onSuccess, router],
  );

  const inputClass =
    'w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder-text-tertiary focus:border-accent focus:outline-none';
  const selectClass = inputClass;
  const labelClass = 'block text-xs text-text-secondary mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-medium text-white">Record Payment</h2>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor={fid('amount')} className={labelClass}>Amount (cents) *</label>
          <input
            id={fid('amount')}
            className={inputClass}
            type="number"
            min={1}
            value={amountCents || ''}
            onChange={(e) => setAmountCents(Number(e.target.value))}
            placeholder="50000"
            required
          />
          {amountCents > 0 && (
            <p className="text-[10px] text-os-business mt-1">
              = ${(amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={fid('method')} className={labelClass}>Method</label>
          <select id={fid('method')} className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={fid('received-on')} className={labelClass}>Received On</label>
          <input
            id={fid('received-on')}
            className={inputClass}
            type="date"
            value={receivedOn}
            onChange={(e) => setReceivedOn(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={fid('reference')} className={labelClass}>Reference</label>
          <input
            id={fid('reference')}
            className={inputClass}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Check #, transaction ID..."
          />
        </div>
      </div>

      <div>
        <label htmlFor={fid('notes')} className={labelClass}>Notes</label>
        <textarea
          id={fid('notes')}
          className={inputClass}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-os-business hover:bg-os-business/90 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors"
      >
        {loading ? 'Recording...' : 'Record Payment'}
      </button>
    </form>
  );
}
