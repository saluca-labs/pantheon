/**
 * MIT License
 *
 * Copyright (c) 2025 Saluca LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */

'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  PROJECT_STATUSES,
  BILLING_MODELS,
  type Project,
  type ProjectStatus,
  type BillingModel,
} from '@/lib/agentic-os/business/projects';

interface ProjectFormProps {
  contacts?: { id: string; firstName: string; lastName: string }[];
  deals?: { id: string; title: string }[];
  initial?: Project;
  onCreated?: (project?: Project) => void;
  compact?: boolean;
}

export default function ProjectForm({
  contacts = [],
  deals = [],
  initial,
  onCreated,
  compact = false,
}: ProjectFormProps) {
  const isEditing = !!initial;
  const router = useRouter();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [contactId, setContactId] = useState(initial?.contactId ?? '');
  const [dealId, setDealId] = useState(initial?.dealId ?? '');
  const [descriptionMd, setDescriptionMd] = useState(initial?.descriptionMd ?? '');
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? 'active');
  const [billingModel, setBillingModel] = useState<BillingModel>(initial?.billingModel ?? 'hourly');
  const [defaultRateCents, setDefaultRateCents] = useState(
    initial?.defaultRateCents != null ? String(initial.defaultRateCents) : ''
  );
  const [budgetCents, setBudgetCents] = useState(
    initial?.budgetCents != null ? String(initial.budgetCents) : ''
  );
  const [currency, setCurrency] = useState(initial?.currency ?? 'USD');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [targetCompletionDate, setTargetCompletionDate] = useState(
    initial?.targetCompletionDate ?? ''
  );
  const [coverImageUrl, setCoverImageUrl] = useState(initial?.coverImageUrl ?? '');
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    const body = {
      title: title.trim(),
      slug: slug.trim() || undefined,
      contact_id: contactId || null,
      deal_id: dealId || null,
      description_md: descriptionMd.trim() || undefined,
      status,
      billing_model: billingModel,
      default_rate_cents: defaultRateCents ? parseInt(defaultRateCents, 10) : null,
      budget_cents: budgetCents ? parseInt(budgetCents, 10) : null,
      currency: currency || 'USD',
      start_date: startDate || null,
      target_completion_date: targetCompletionDate || null,
      cover_image_url: coverImageUrl.trim() || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };

    setLoading(true);
    try {
      const url = isEditing
        ? `/api/tiresias/agentic-os/business/projects/${initial!.id}`
        : '/api/tiresias/agentic-os/business/projects';

      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
      }

      const data = await res.json();
      const project = data.project as Project;
      onCreated?.(project);

      if (!isEditing && !onCreated) {
        router.push(`/dashboard/os/business/projects/${project.id}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-xs text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none transition';
  const labelClass = 'block text-xs font-medium text-text-secondary mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <label htmlFor={fid('title')} className={labelClass}>Title *</label>
        <input
          id={fid('title')}
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Project title"
          required
        />
      </div>

      {!compact && (
        <>
          {/* Slug */}
          <div>
            <label htmlFor={fid('slug')} className={labelClass}>Slug</label>
            <input
              id={fid('slug')}
              className={inputClass}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-project (auto-generated if empty)"
            />
          </div>

          {/* Contact + Deal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={fid('contact')} className={labelClass}>Contact</label>
              <select id={fid('contact')} className={inputClass} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">None</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id} className="bg-surface-2 text-white">
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={fid('deal')} className={labelClass}>Deal</label>
              <select id={fid('deal')} className={inputClass} value={dealId} onChange={(e) => setDealId(e.target.value)}>
                <option value="">None</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id} className="bg-surface-2 text-white">
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status + Billing Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={fid('status')} className={labelClass}>Status</label>
              <select
                id={fid('status')}
                className={inputClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              >
                {PROJECT_STATUSES.filter((s) => s !== 'archived').map((s) => (
                  <option key={s} value={s} className="bg-surface-2 text-white">
                    {s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={fid('billing-model')} className={labelClass}>Billing Model</label>
              <select
                id={fid('billing-model')}
                className={inputClass}
                value={billingModel}
                onChange={(e) => setBillingModel(e.target.value as BillingModel)}
              >
                {BILLING_MODELS.map((m) => (
                  <option key={m} value={m} className="bg-surface-2 text-white">
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rate + Budget */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={fid('default-rate')} className={labelClass}>Default Rate (cents)</label>
              <input
                id={fid('default-rate')}
                className={inputClass}
                type="number"
                value={defaultRateCents}
                onChange={(e) => setDefaultRateCents(e.target.value)}
                placeholder="e.g. 15000 for $150/hr"
                min={0}
              />
            </div>
            <div>
              <label htmlFor={fid('budget')} className={labelClass}>Budget (cents)</label>
              <input
                id={fid('budget')}
                className={inputClass}
                type="number"
                value={budgetCents}
                onChange={(e) => setBudgetCents(e.target.value)}
                placeholder="e.g. 500000 for $5,000"
                min={0}
              />
            </div>
          </div>

          {/* Currency + Dates */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor={fid('currency')} className={labelClass}>Currency</label>
              <select id={fid('currency')} className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD" className="bg-surface-2 text-white">USD</option>
                <option value="EUR" className="bg-surface-2 text-white">EUR</option>
                <option value="GBP" className="bg-surface-2 text-white">GBP</option>
                <option value="CAD" className="bg-surface-2 text-white">CAD</option>
              </select>
            </div>
            <div>
              <label htmlFor={fid('start-date')} className={labelClass}>Start Date</label>
              <input
                id={fid('start-date')}
                className={inputClass}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={fid('target-completion')} className={labelClass}>Target Completion</label>
              <input
                id={fid('target-completion')}
                className={inputClass}
                type="date"
                value={targetCompletionDate}
                onChange={(e) => setTargetCompletionDate(e.target.value)}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label htmlFor={fid('tags')} className={labelClass}>Tags (comma-separated)</label>
            <input
              id={fid('tags')}
              className={inputClass}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="consulting, security"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor={fid('description')} className={labelClass}>Description (Markdown)</label>
            <textarea
              id={fid('description')}
              className={inputClass}
              rows={4}
              value={descriptionMd}
              onChange={(e) => setDescriptionMd(e.target.value)}
              placeholder="Project notes and scope..."
            />
          </div>
        </>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium px-4 py-1.5 transition disabled:opacity-50"
        >
          {loading ? 'Saving...' : isEditing ? 'Update Project' : 'Create Project'}
        </button>
        <button
          type="button"
          onClick={() => onCreated?.()}
          className="rounded-lg border border-border-subtle bg-surface-2 hover:border-accent text-text-secondary text-sm font-medium px-4 py-1.5 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
