/**
 * Business OS Phase 4 — invoice form (create + edit).
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

const TERMS_OPTIONS = [
  { value: 'due_on_receipt', label: 'Due on Receipt' },
  { value: 'net_7', label: 'Net 7' },
  { value: 'net_14', label: 'Net 14' },
  { value: 'net_15', label: 'Net 15' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'net_60', label: 'Net 60' },
  { value: 'custom', label: 'Custom' },
];

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
  invoiceNumberPrefix: string;
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
    invoiceNumber?: string;
    contactId?: string | null;
    dealId?: string | null;
    projectId?: string | null;
    descriptionMd?: string;
    terms?: string;
    invoiceDate?: string;
    dueOn?: string;
    currency?: string;
  };
  onSuccess?: () => void;
  compact?: boolean;
}

export default function InvoiceForm({
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
  const [invoiceNumber, setInvoiceNumber] = useState(
    initialValues?.invoiceNumber ?? (settings?.invoiceNumberPrefix
      ? `${settings.invoiceNumberPrefix}-`
      : ''),
  );
  const [contactId, setContactId] = useState(initialValues?.contactId ?? '');
  const [dealId, setDealId] = useState(initialValues?.dealId ?? '');
  const [projectId, setProjectId] = useState(initialValues?.projectId ?? '');
  const [descriptionMd, setDescriptionMd] = useState(initialValues?.descriptionMd ?? '');
  const [terms, setTerms] = useState(initialValues?.terms ?? 'net_30');
  const [invoiceDate, setInvoiceDate] = useState(
    initialValues?.invoiceDate ?? new Date().toISOString().slice(0, 10),
  );
  const [dueOn, setDueOn] = useState(
    initialValues?.dueOn ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().slice(0, 10);
    })(),
  );
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
        invoice_number: invoiceNumber,
        contact_id: contactId || null,
        deal_id: dealId || null,
        project_id: projectId || null,
        description_md: descriptionMd,
        terms,
        invoice_date: invoiceDate,
        due_on: dueOn,
        currency,
      };

      try {
        const url = isEdit
          ? `/api/tiresias/agentic-os/business/invoices/${initialValues!.id}`
          : '/api/tiresias/agentic-os/business/invoices';
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
    [title, invoiceNumber, contactId, dealId, projectId, descriptionMd, terms, invoiceDate, dueOn, currency, isEdit, initialValues, onSuccess, router],
  );

  const inputClass =
    'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none transition';
  const selectClass = inputClass;
  const labelClass = 'block text-xs text-text-secondary mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!compact && (
        <h2 className="text-lg font-medium text-text-primary">
          {isEdit ? 'Edit Invoice' : 'New Invoice'}
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
            placeholder="Monthly retainer"
            required
          />
        </div>
        <div>
          <label htmlFor={fid('invoice-number')} className={labelClass}>Invoice Number *</label>
          <input
            id={fid('invoice-number')}
            className={inputClass}
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="INV-001"
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
          <label htmlFor={fid('terms')} className={labelClass}>Terms</label>
          <select id={fid('terms')} className={selectClass} value={terms} onChange={(e) => setTerms(e.target.value)}>
            {TERMS_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={fid('invoice-date')} className={labelClass}>Invoice Date</label>
          <input
            id={fid('invoice-date')}
            className={inputClass}
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={fid('due-on')} className={labelClass}>Due Date</label>
          <input
            id={fid('due-on')}
            className={inputClass}
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
          />
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
        {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Invoice'}
      </button>
    </form>
  );
}
