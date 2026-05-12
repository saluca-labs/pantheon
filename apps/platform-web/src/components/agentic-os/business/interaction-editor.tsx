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
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

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
        const data = await r.json().catch(() => ({}));
        throw new Error((data as any).error ?? `Failed (${r.status})`);
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
      className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 grid grid-cols-1 sm:grid-cols-[150px_1fr_auto] gap-3 items-end"
    >
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Type</span>
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
        <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Summary</span>
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
        className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
      >
        {saving ? '…' : '+ Log'}
      </button>
      {err && <span className="sm:col-span-3 text-xs text-red-300">{err}</span>}
    </form>
  );
}
