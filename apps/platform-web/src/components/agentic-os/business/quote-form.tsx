/**
 * Business OS Phase 4 — quote form (create + edit).
 *
 * Wave D (UI Depth Wave) polish: migrated the hand-spelled hex / `text-white`
 * / `border-red-800` literals onto the visual-language tokens (surface ladder,
 * text hierarchy, `danger` status token, `accent`). Same fields, same submit
 * payload, same routes — presentation only.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

'use client';

import { useId, useState, useCallback } from 'react';
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

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

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
    'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none transition';
  const selectClass = inputClass;
  const labelClass = 'block text-xs text-text-secondary mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!compact && (
        <h2 className="text-lg font-medium text-text-primary">
          {isEdit ? 'Edit Quote' : 'New Quote'}
        </h2>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div className={compact ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        <div>
          <label htmlFor={fid('title')} className={labelClass}>Title *</label>
          <input
            id={fid('title')}
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Website redesign"
            required
          />
        </div>
        <div>
          <label htmlFor={fid('quote-number')} className={labelClass}>Quote Number *</label>
          <input
            id={fid('quote-number')}
            className={inputClass}
            value={quoteNumber}
            onChange={(e) => setQuoteNumber(e.target.value)}
            placeholder="Q-001"
            required
          />
        </div>
        <div>
          <label htmlFor={fid('contact')} className={labelClass}>Contact</label>
          <select id={fid('contact')} className={selectClass} value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">-- None --</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={fid('deal')} className={labelClass}>Deal</label>
          <select id={fid('deal')} className={selectClass} value={dealId} onChange={(e) => setDealId(e.target.value)}>
            <option value="">-- None --</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={fid('project')} className={labelClass}>Project</label>
          <select id={fid('project')} className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">-- None --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={fid('currency')} className={labelClass}>Currency</label>
          <input
            id={fid('currency')}
            className={inputClass}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={8}
          />
        </div>
        <div>
          <label htmlFor={fid('quote-date')} className={labelClass}>Quote Date</label>
          <input
            id={fid('quote-date')}
            className={inputClass}
            type="date"
            value={quoteDate}
            onChange={(e) => setQuoteDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={fid('expires-on')} className={labelClass}>Expires On</label>
          <input
            id={fid('expires-on')}
            className={inputClass}
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor={fid('description')} className={labelClass}>Description</label>
        <textarea
          id={fid('description')}
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
        className="inline-flex items-center gap-2 rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
      >
        {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Quote'}
      </button>
    </form>
  );
}
