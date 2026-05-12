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
import { DEAL_STAGES, type Deal, type DealStage } from '@/lib/agentic-os/business/deals';

interface DealFormProps {
  contacts: { id: string; firstName: string; lastName: string }[];
  orgs: { id: string; name: string }[];
  onCreated?: (deal?: Deal) => void;
  initial?: Deal;
}

export default function DealForm({ contacts, orgs, onCreated, initial }: DealFormProps) {
  const isEditing = !!initial;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [contactId, setContactId] = useState(initial?.contactId ?? '');
  const [organizationId, setOrganizationId] = useState(initial?.organizationId ?? '');
  const [valueCents, setValueCents] = useState(String(initial?.valueCents ?? ''));
  const [currency, setCurrency] = useState(initial?.currency ?? 'USD');
  const [probabilityPct, setProbabilityPct] = useState(String(initial?.probabilityPct ?? 50));
  const [expectedCloseDate, setExpectedCloseDate] = useState(
    initial?.expectedCloseDate ? initial.expectedCloseDate.split('T')[0] : ''
  );
  const [stage, setStage] = useState<DealStage>(initial?.stage ?? 'lead');
  const [descriptionMd, setDescriptionMd] = useState(initial?.descriptionMd ?? '');
  const [source, setSource] = useState(initial?.source ?? '');
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '');
  const [lostReason, setLostReason] = useState(initial?.lostReason ?? '');

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
      contact_id: contactId || null,
      organization_id: organizationId || null,
      value_cents: parseInt(valueCents, 10) || 0,
      currency: currency || 'USD',
      probability_pct: Math.min(100, Math.max(0, parseInt(probabilityPct, 10) || 0)),
      expected_close_date: expectedCloseDate || null,
      stage,
      description_md: descriptionMd.trim() || null,
      source: source.trim() || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      lost_reason: stage === 'lost' ? lostReason.trim() || null : null,
    };

    setLoading(true);
    try {
      const url = isEditing
        ? `/api/tiresias/agentic-os/business/deals/${initial!.id}`
        : '/api/tiresias/agentic-os/business/deals';

      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
      }

      const deal: Deal = await res.json();
      onCreated?.(deal);
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
    <form onSubmit={handleSubmit} className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 space-y-4">
      <h3 className="text-white text-sm font-semibold">
        {isEditing ? 'Edit Deal' : 'New Deal'}
      </h3>

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
          placeholder="Deal title"
          required
        />
      </div>

      {/* Contact + Org selects */}
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
          <label className={labelClass}>Organization</label>
          <select
            className={inputClass}
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
          >
            <option value="">None</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id} className="bg-[#1a1d27] text-white">
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Value + Currency */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Value (cents)</label>
          <input
            className={inputClass}
            type="number"
            value={valueCents}
            onChange={(e) => setValueCents(e.target.value)}
            placeholder="0"
            min={0}
          />
        </div>
        <div>
          <label className={labelClass}>Currency</label>
          <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD" className="bg-[#1a1d27] text-white">USD</option>
            <option value="EUR" className="bg-[#1a1d27] text-white">EUR</option>
            <option value="GBP" className="bg-[#1a1d27] text-white">GBP</option>
            <option value="CAD" className="bg-[#1a1d27] text-white">CAD</option>
            <option value="AUD" className="bg-[#1a1d27] text-white">AUD</option>
          </select>
        </div>
      </div>

      {/* Probability + Close Date + Stage */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Probability %</label>
          <input
            className={inputClass}
            type="number"
            value={probabilityPct}
            onChange={(e) => setProbabilityPct(e.target.value)}
            min={0}
            max={100}
          />
        </div>
        <div>
          <label className={labelClass}>Expected Close</label>
          <input
            className={inputClass}
            type="date"
            value={expectedCloseDate}
            onChange={(e) => setExpectedCloseDate(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Stage</label>
          <select
            className={inputClass}
            value={stage}
            onChange={(e) => setStage(e.target.value as DealStage)}
          >
            {DEAL_STAGES.map((s) => (
              <option key={s} value={s} className="bg-[#1a1d27] text-white">
                {s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Source + Tags */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Source</label>
          <input
            className={inputClass}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. referral, website"
          />
        </div>
        <div>
          <label className={labelClass}>Tags (comma-separated)</label>
          <input
            className={inputClass}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="saas, enterprise"
          />
        </div>
      </div>

      {/* Lost reason (only when stage is lost) */}
      {stage === 'lost' && (
        <div>
          <label className={labelClass}>Lost Reason</label>
          <input
            className={inputClass}
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="Why was this deal lost?"
          />
        </div>
      )}

      {/* Description */}
      <div>
        <label className={labelClass}>Description (Markdown)</label>
        <textarea
          className={inputClass}
          rows={4}
          value={descriptionMd}
          onChange={(e) => setDescriptionMd(e.target.value)}
          placeholder="Deal notes..."
        />
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium px-4 py-1.5 transition disabled:opacity-50"
        >
          {loading ? 'Saving...' : isEditing ? 'Update Deal' : 'Create Deal'}
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
