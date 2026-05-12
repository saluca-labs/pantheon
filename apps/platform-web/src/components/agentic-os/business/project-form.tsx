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

import { useState, type FormEvent } from 'react';
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
    'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-1.5 text-xs text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none transition';
  const labelClass = 'block text-xs font-medium text-[#94a3b8] mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <label className={labelClass}>Title *</label>
        <input
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
            <label className={labelClass}>Slug</label>
            <input
              className={inputClass}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-project (auto-generated if empty)"
            />
          </div>

          {/* Contact + Deal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Contact</label>
              <select className={inputClass} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">None</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#1a1d27] text-white">
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Deal</label>
              <select className={inputClass} value={dealId} onChange={(e) => setDealId(e.target.value)}>
                <option value="">None</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#1a1d27] text-white">
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status + Billing Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Status</label>
              <select
                className={inputClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              >
                {PROJECT_STATUSES.filter((s) => s !== 'archived').map((s) => (
                  <option key={s} value={s} className="bg-[#1a1d27] text-white">
                    {s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Billing Model</label>
              <select
                className={inputClass}
                value={billingModel}
                onChange={(e) => setBillingModel(e.target.value as BillingModel)}
              >
                {BILLING_MODELS.map((m) => (
                  <option key={m} value={m} className="bg-[#1a1d27] text-white">
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rate + Budget */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Default Rate (cents)</label>
              <input
                className={inputClass}
                type="number"
                value={defaultRateCents}
                onChange={(e) => setDefaultRateCents(e.target.value)}
                placeholder="e.g. 15000 for $150/hr"
                min={0}
              />
            </div>
            <div>
              <label className={labelClass}>Budget (cents)</label>
              <input
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
              <label className={labelClass}>Currency</label>
              <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD" className="bg-[#1a1d27] text-white">USD</option>
                <option value="EUR" className="bg-[#1a1d27] text-white">EUR</option>
                <option value="GBP" className="bg-[#1a1d27] text-white">GBP</option>
                <option value="CAD" className="bg-[#1a1d27] text-white">CAD</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Start Date</label>
              <input
                className={inputClass}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Target Completion</label>
              <input
                className={inputClass}
                type="date"
                value={targetCompletionDate}
                onChange={(e) => setTargetCompletionDate(e.target.value)}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className={labelClass}>Tags (comma-separated)</label>
            <input
              className={inputClass}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="consulting, security"
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description (Markdown)</label>
            <textarea
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
          className="rounded-lg border border-[#2a2d3e] bg-[#1a1d27] hover:border-[#4361EE] text-[#94a3b8] text-sm font-medium px-4 py-1.5 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
