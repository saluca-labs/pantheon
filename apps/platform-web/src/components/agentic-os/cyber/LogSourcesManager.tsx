'use client';

/**
 * CyberSec OS — Log sources list + filter + create/edit form + delete.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type {
  LogSource,
  LogSourceKind,
  LogSourceStatus,
} from '@/lib/agentic-os/cyber/log-sources';
import {
  LOG_SOURCE_KINDS,
  LOG_SOURCE_STATUSES,
} from '@/lib/agentic-os/cyber/log-sources';
import { LogSourceForm } from './LogSourceForm';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

const API = '/api/tiresias/agentic-os/cyber/log-sources';

const STATUS_STYLE: Record<LogSourceStatus, string> = {
  active:         'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  paused:         'text-amber-300 bg-amber-500/10 border-amber-500/30',
  misconfigured:  'text-red-300 bg-red-500/10 border-red-500/30',
  decommissioned: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
};

export function LogSourcesManager({ initialSources }: { initialSources: LogSource[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<LogSource | null>(null);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<LogSourceKind | ''>('');
  const [status, setStatus] = useState<LogSourceStatus | ''>('');
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = initialSources.filter((s) => {
    if (kind && s.kind !== kind) return false;
    if (status && s.status !== status) return false;
    return true;
  });

  async function remove(source: LogSource) {
    if (!confirm(`Delete log source "${source.name}"? Alerts linked to it will be unlinked.`)) return;
    setBusy(source.id);
    try {
      const r = await fetch(`${API}/${source.id}`, { method: 'DELETE' });
      if (r.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LogSourceKind | '')}
            className={inputCls}
          >
            <option value="">All</option>
            {LOG_SOURCE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as LogSourceStatus | '')}
            className={inputCls}
          >
            <option value="">All</option>
            {LOG_SOURCE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setCreating((c) => !c);
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white font-medium px-3 py-2 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Close' : 'New source'}
        </button>
      </div>

      {creating && (
        <LogSourceForm
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}
      {editing && (
        <LogSourceForm
          source={editing}
          onSaved={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-[#94a3b8] p-6 rounded-xl border border-dashed border-[#2a2d3e]">
          No log sources match the current filters.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-3 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-medium text-white truncate">{s.name}</span>
                  <span
                    className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                      STATUS_STYLE[s.status]
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                <p className="text-xs text-[#94a3b8]">
                  {s.kind}
                  {s.vendor && ` · ${s.vendor}`}
                  {s.endpointHint && ` · ${s.endpointHint}`}
                </p>
                {s.notes && (
                  <p className="text-xs text-[#94a3b8] mt-1 line-clamp-2">{s.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setEditing(s);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-[#2a2d3e] text-[#cbd5e1] hover:text-white px-2 py-1 text-xs transition"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(s)}
                  disabled={busy === s.id}
                  className="inline-flex items-center gap-1 rounded border border-[#2a2d3e] text-red-300 hover:text-red-200 disabled:opacity-60 px-2 py-1 text-xs transition"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
