'use client';

/**
 * Business OS Phase 1 — organization create form.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ORG_TYPES, type OrgType } from '@/lib/agentic-os/business/crm';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

export function OrganizationForm({ onCreated }: { onCreated?: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    orgType: 'company' as OrgType,
    website: '',
    industry: '',
    address: '',
    tagsRaw: '',
    notes: '',
    descriptionMd: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tags = form.tagsRaw
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const body: any = {
        name: form.name.trim(),
        org_type: form.orgType,
        website: form.website.trim() || null,
        industry: form.industry.trim() || null,
        notes: form.notes.trim() || null,
        address: form.address.trim() || null,
        description_md: form.descriptionMd,
        tags,
      };
      const r = await fetch('/api/tiresias/agentic-os/business/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error((data as any).error ?? `Failed (${r.status})`);
      }
      onCreated?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 space-y-4"
    >
      <h2 className="text-sm font-semibold text-white">Add organization</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={inputCls}
            placeholder="Acme Co"
            required
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Type</span>
          <select
            value={form.orgType}
            onChange={(e) => setForm((f) => ({ ...f, orgType: e.target.value as OrgType }))}
            className={inputCls}
          >
            {ORG_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Website</span>
          <input
            type="url"
            value={form.website}
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            className={inputCls}
            placeholder="https://"
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Industry</span>
          <input
            value={form.industry}
            onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Tags (comma-separated)</span>
          <input
            value={form.tagsRaw}
            onChange={(e) => setForm((f) => ({ ...f, tagsRaw: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Address</span>
          <input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Notes (one line)</span>
          <input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Description (markdown)</span>
          <textarea
            value={form.descriptionMd}
            onChange={(e) => setForm((f) => ({ ...f, descriptionMd: e.target.value }))}
            className={`${inputCls} min-h-[100px]`}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
        >
          {saving ? 'Adding…' : 'Add organization'}
        </button>
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </form>
  );
}
