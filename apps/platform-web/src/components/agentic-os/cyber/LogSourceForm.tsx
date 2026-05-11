'use client';

/**
 * CyberSec OS — Log source editor (create + edit).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  LogSource,
  LogSourceKind,
  LogSourceStatus,
} from '@/lib/agentic-os/cyber/log-sources';
import {
  LOG_SOURCE_KINDS,
  LOG_SOURCE_STATUSES,
} from '@/lib/agentic-os/cyber/log-sources';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

const API = '/api/tiresias/agentic-os/cyber/log-sources';

export interface LogSourceFormProps {
  source?: LogSource | null;
  onSaved?: (source: LogSource) => void;
  onCancel?: () => void;
}

export function LogSourceForm({ source, onSaved, onCancel }: LogSourceFormProps) {
  const router = useRouter();
  const [name, setName] = useState(source?.name ?? '');
  const [kind, setKind] = useState<LogSourceKind>(source?.kind ?? 'other');
  const [vendor, setVendor] = useState(source?.vendor ?? '');
  const [endpointHint, setEndpointHint] = useState(source?.endpointHint ?? '');
  const [status, setStatus] = useState<LogSourceStatus>(source?.status ?? 'active');
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!source;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const url = isEdit ? `${API}/${source!.id}` : API;
      const r = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          kind,
          vendor: vendor || null,
          endpointHint: endpointHint || null,
          status,
          notes: notes || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { source: saved } = await r.json();
      onSaved?.(saved);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-4 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Splunk Cloud — prod"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LogSourceKind)}
            className={inputCls}
          >
            {LOG_SOURCE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as LogSourceStatus)}
            className={inputCls}
          >
            {LOG_SOURCE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Vendor</span>
          <input
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Splunk / Wazuh / Suricata / CrowdStrike"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Endpoint hint</span>
          <input
            value={endpointHint}
            onChange={(e) => setEndpointHint(e.target.value)}
            placeholder="splunk.example.com:8089"
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Pulling alerts via correlation search every 5 minutes…"
            className={inputCls}
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create log source'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#2a2d3e] text-[#94a3b8] hover:text-white px-3 py-1.5 text-sm transition"
          >
            Cancel
          </button>
        )}
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </form>
  );
}
