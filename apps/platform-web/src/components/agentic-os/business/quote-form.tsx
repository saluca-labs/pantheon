/**
 * Business OS Phase 4 — quote form (create + edit).
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface DealOption {
  id: string;
  title: string;
}

interface ProjectOption {
  id: string;
  title: string;
}

interface BusinessSettings {
  quoteNumberPrefix: string;
  defaultCurrency: string;
}

interface Props {
  contacts?: ContactOption[];
  deals?: DealOption[];
  projects?: ProjectOption[];
  settings?: BusinessSettings;
  initialValues?: {
    id?: string;
    title?: string;
    quoteNumber?: string;
    contactId?: string | null;
    dealId?: string | null;
    projectId?: string | null;
    descriptionMd?: string;
    quoteDate?: string;
    expiresOn?: string | null;
    currency?: string;
  };
  onSuccess?: () => void;
  compact?: boolean;
}

export default function QuoteForm({
  contacts = [],
  deals = [],
  projects = [],
  settings,
  initialValues,
  onSuccess,
  compact = false,
}: Props) {
  const router = useRouter();
  const isEdit = !!initialValues?.id;

  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [quoteNumber, setQuoteNumber] = useState(
    initialValues?.quoteNumber ?? (settings?.quoteNumberPrefix
      ? `${settings.quoteNumberPrefix}-`
      : ''),
  );
  const [contactId, setContactId] = useState(initialValues?.contactId ?? '');
  const [dealId, setDealId] = useState(initialValues?.dealId ?? '');
  const [projectId, setProjectId] = useState(initialValues?.projectId ?? '');
  const [descriptionMd, setDescriptionMd] = useState(initialValues?.descriptionMd ?? '');
  const [quoteDate, setQuoteDate] = useState(
    initialValues?.quoteDate ?? new Date().toISOString().slice(0, 10),
  );
  const [expiresOn, setExpiresOn] = useState(initialValues?.expiresOn ?? '');
  const [currency, setCurrency] = useState(initialValues?.currency ?? settings?.defaultCurrency ?? 'USD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      const body: Record<string, unknown> = {
        title,
        quote_number: quoteNumber,
        contact_id: contactId || null,
        deal_id: dealId || null,
        project_id: projectId || null,
        description_md: descriptionMd,
        quote_date: quoteDate,
        expires_on: expiresOn || null,
        currency,
      };

      try {
        const url = isEdit
          ? `/api/tiresias/agentic-os/business/quotes/${initialValues!.id}`
          : '/api/tiresias/agentic-os/business/quotes';
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
    [title, quoteNumber, contactId, dealId, projectId, descriptionMd, quoteDate, expiresOn, currency, isEdit, initialValues, onSuccess, router],
  );

  const inputClass =
    'w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-accent focus:outline-none';
  const selectClass = inputClass;
  const labelClass = 'block text-xs text-text-secondary mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!compact && (
        <h2 className="text-lg font-medium text-white">
          {isEdit ? 'Edit Quote' : 'New Quote'}
        </h2>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className={compact ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        <div>
          <label className={labelClass}>Title *</label>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Website redesign"
            required
          />
        </div>
        <div>
          <label className={labelClass}>Quote Number *</label>
          <input
            className={inputClass}
            value={quoteNumber}
            onChange={(e) => setQuoteNumber(e.target.value)}
            placeholder="Q-001"
            required
          />
        </div>
        <div>
          <label className={labelClass}>Contact</label>
          <select className={selectClass} value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">-- None --</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Deal</label>
          <select className={selectClass} value={dealId} onChange={(e) => setDealId(e.target.value)}>
            <option value="">-- None --</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
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
          <label className={labelClass}>Currency</label>
          <input
            className={inputClass}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={8}
          />
        </div>
        <div>
          <label className={labelClass}>Quote Date</label>
          <input
            className={inputClass}
            type="date"
            value={quoteDate}
            onChange={(e) => setQuoteDate(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Expires On</label>
          <input
            className={inputClass}
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          className={inputClass}
          rows={3}
          value={descriptionMd}
          onChange={(e) => setDescriptionMd(e.target.value)}
          placeholder="Markdown description..."
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors"
      >
        {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Quote'}
      </button>
    </form>
  );
}
