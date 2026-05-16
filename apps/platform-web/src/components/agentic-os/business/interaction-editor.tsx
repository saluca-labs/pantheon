'use client';

/**
 * Business OS Phase 1 — interaction quick-add form.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { useState } from 'react';
import {
  INTERACTION_TYPES,
  type Interaction,
  type InteractionType,
} from '@/lib/agentic-os/business/crm';

interface Props {
  defaultPersonId?: string | null;
  defaultOrganizationId?: string | null;
  defaultDealId?: string | null;
  onCreated?: (interaction: Interaction) => void;
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export function InteractionEditor({
  defaultPersonId = null,
  defaultOrganizationId = null,
  defaultDealId = null,
  onCreated,
}: Props) {
  const [type, setType] = useState<InteractionType>('note');
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) {
      setErr('Summary is required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        person_id: defaultPersonId || null,
        organization_id: defaultOrganizationId || null,
        deal_id: defaultDealId || null,
        interaction_type: type,
        summary: summary.trim(),
      };
      const r = await fetch('/api/tiresias/agentic-os/business/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed (${r.status})`);
      }
      const data = await r.json();
      onCreated?.(data.interaction);
      setSummary('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border-subtle bg-surface-2 p-4 grid grid-cols-1 sm:grid-cols-[150px_1fr_auto] gap-3 items-end"
    >
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as InteractionType)}
          className={inputCls}
        >
          {INTERACTION_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Summary</span>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className={inputCls}
          placeholder="Quick note about the interaction"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
      >
        {saving ? '…' : '+ Log'}
      </button>
      {err && <span className="sm:col-span-3 text-xs text-danger">{err}</span>}
    </form>
  );
}
