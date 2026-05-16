'use client';

/**
 * Business OS Phase 1 — person create/edit form.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CONTACT_STAGES,
  validatePerson,
  type ContactStage,
  type Organization,
} from '@/lib/agentic-os/business/crm';

interface Props {
  organizations: Pick<Organization, 'id' | 'name'>[];
  onCreated?: () => void;
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export function PersonForm({ organizations, onCreated }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: '',
    organizationId: '',
    stage: 'lead' as ContactStage | string,
    tagsRaw: '',
    notes: '',
    address: '',
    descriptionMd: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validatePerson({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email || undefined,
      // Allow free-form stages — only validate via the legacy taxonomy
      // when the value is in that set.
      stage: (CONTACT_STAGES as readonly string[]).includes(form.stage)
        ? (form.stage as ContactStage)
        : 'lead',
    });
    if (errors.length > 0) {
      setError(errors[0] ?? 'Validation error');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tags = form.tagsRaw
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const body: {
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
        role: string | null;
        organization_id: string | null;
        stage: string;
        tags: string[];
        notes: string | null;
        address: string | null;
        description_md: string;
      } = {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        role: form.role.trim() || null,
        organization_id: form.organizationId || null,
        stage: form.stage,
        tags,
        notes: form.notes.trim() || null,
        address: form.address.trim() || null,
        description_md: form.descriptionMd,
      };
      const r = await fetch('/api/tiresias/agentic-os/business/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed (${r.status})`);
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
      className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-4"
    >
      <h2 className="text-sm font-semibold text-white">Add person</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">First name</span>
          <input
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            className={inputCls}
            placeholder="Jane"
            required
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Last name</span>
          <input
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            className={inputCls}
            placeholder="Smith"
            required
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className={inputCls}
            placeholder="jane@example.com"
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Phone</span>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className={inputCls}
            placeholder="+1 555-0123"
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Role</span>
          <input
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className={inputCls}
            placeholder="CTO"
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Organization</span>
          <select
            value={form.organizationId}
            onChange={(e) => setForm((f) => ({ ...f, organizationId: e.target.value }))}
            className={inputCls}
          >
            <option value="">— none —</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Stage / Tier</span>
          <input
            value={form.stage}
            onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
            list="person-stage-options"
            className={inputCls}
            placeholder="lead"
          />
          <datalist id="person-stage-options">
            {CONTACT_STAGES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Tags (comma-separated)</span>
          <input
            value={form.tagsRaw}
            onChange={(e) => setForm((f) => ({ ...f, tagsRaw: e.target.value }))}
            className={inputCls}
            placeholder="warm, oss-friendly"
          />
        </label>
      </div>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Address</span>
        <input
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Notes (one line)</span>
        <input
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Description (markdown)</span>
        <textarea
          value={form.descriptionMd}
          onChange={(e) => setForm((f) => ({ ...f, descriptionMd: e.target.value }))}
          className={`${inputCls} min-h-[100px]`}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
        >
          {saving ? 'Adding…' : 'Add person'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </form>
  );
}
