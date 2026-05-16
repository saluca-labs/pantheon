'use client';

/**
 * Business OS Phase 1 — settings editor form.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessSettings } from '@/lib/agentic-os/business/settings';
import {
  ACCENT_COLORS,
  COMMON_CURRENCIES,
  PAYMENT_TERMS,
} from '@/lib/agentic-os/business/settings';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

interface Props {
  initial: BusinessSettings;
}

export function BusinessSettingsForm({ initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    business_name: initial.businessName,
    logo_url: initial.logoUrl ?? '',
    address: initial.address,
    tax_id: initial.taxId ?? '',
    default_currency: initial.defaultCurrency,
    invoice_number_prefix: initial.invoiceNumberPrefix,
    quote_number_prefix: initial.quoteNumberPrefix,
    default_payment_terms: initial.defaultPaymentTerms,
    default_hourly_rate_dollars:
      initial.defaultHourlyRateCents == null
        ? ''
        : (initial.defaultHourlyRateCents / 100).toString(),
    accent_color: initial.accentColor,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const rateDollars = form.default_hourly_rate_dollars.trim();
      let rateCents: number | null | undefined = undefined;
      if (rateDollars === '') {
        rateCents = null;
      } else {
        const parsed = Number(rateDollars);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error('Hourly rate must be a non-negative number');
        }
        rateCents = Math.round(parsed * 100);
      }
      const body: any = {
        business_name: form.business_name,
        logo_url: form.logo_url.trim() || null,
        address: form.address,
        tax_id: form.tax_id.trim() || null,
        default_currency: form.default_currency.trim() || 'USD',
        invoice_number_prefix: form.invoice_number_prefix.trim() || 'INV',
        quote_number_prefix: form.quote_number_prefix.trim() || 'Q',
        default_payment_terms: form.default_payment_terms.trim() || 'net_30',
        default_hourly_rate_cents: rateCents,
        accent_color: form.accent_color.trim() || 'teal',
      };
      const r = await fetch('/api/tiresias/agentic-os/business/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error((data as any).error ?? `Failed (${r.status})`);
      }
      setMsg('Saved.');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Business name</span>
          <input
            value={form.business_name}
            onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Logo URL</span>
          <input
            value={form.logo_url}
            onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
            className={inputCls}
            placeholder="https://"
            type="url"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Address</span>
          <textarea
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            className={`${inputCls} min-h-[80px]`}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Tax ID (EIN / ABN / VAT)</span>
          <input
            value={form.tax_id}
            onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Default currency</span>
          <input
            value={form.default_currency}
            onChange={(e) => setForm((f) => ({ ...f, default_currency: e.target.value }))}
            list="business-settings-currencies"
            className={inputCls}
          />
          <datalist id="business-settings-currencies">
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Invoice prefix</span>
          <input
            value={form.invoice_number_prefix}
            onChange={(e) => setForm((f) => ({ ...f, invoice_number_prefix: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Quote prefix</span>
          <input
            value={form.quote_number_prefix}
            onChange={(e) => setForm((f) => ({ ...f, quote_number_prefix: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Default payment terms</span>
          <input
            value={form.default_payment_terms}
            onChange={(e) => setForm((f) => ({ ...f, default_payment_terms: e.target.value }))}
            list="business-settings-payment-terms"
            className={inputCls}
          />
          <datalist id="business-settings-payment-terms">
            {PAYMENT_TERMS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Default hourly rate ($)</span>
          <input
            value={form.default_hourly_rate_dollars}
            onChange={(e) => setForm((f) => ({ ...f, default_hourly_rate_dollars: e.target.value }))}
            inputMode="decimal"
            className={inputCls}
            placeholder="150"
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Accent color</span>
          <select
            value={form.accent_color}
            onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))}
            className={inputCls}
          >
            {ACCENT_COLORS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <span role="status" aria-live="polite" className="text-sm text-positive">
          {msg ?? ''}
        </span>
        <span role="alert" className="text-sm text-danger">
          {err ?? ''}
        </span>
      </div>
    </form>
  );
}
