'use client';

/**
 * CyberSec OS — Log sources list + filter + create/edit form + delete.
 *
 * Wave C-2a: search + saved-view presets via `CyberListControls` (composing
 * the Wave B `EntitySearch` + `SavedViews` primitives); ad-hoc empty state
 * replaced with the `EmptyState` primitive. The row list itself is kept
 * ad-hoc — it is a compact edit/delete list, not a card grid, and has no
 * selection model.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Database } from 'lucide-react';
import type {
  LogSource,
  LogSourceKind,
  LogSourceStatus,
} from '@/lib/agentic-os/cyber/log-sources';
import {
  LOG_SOURCE_KINDS,
  LOG_SOURCE_STATUSES,
} from '@/lib/agentic-os/cyber/log-sources';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import {
  CyberListControls,
  type CyberQuery,
} from '@/components/agentic-os/cyber/CyberListControls';
import { LogSourceForm } from './LogSourceForm';

const selectCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const API = '/api/tiresias/agentic-os/cyber/log-sources';

const STATUS_STYLE: Record<LogSourceStatus, string> = {
  active:         'text-positive bg-positive/10 border-positive/30',
  paused:         'text-warning bg-warning/10 border-warning/30',
  misconfigured:  'text-danger bg-danger/10 border-danger/30',
  decommissioned: 'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
};

export function LogSourcesManager({ initialSources }: { initialSources: LogSource[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<LogSource | null>(null);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<LogSourceKind | ''>('');
  const [status, setStatus] = useState<LogSourceStatus | ''>('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  function applyQuery(q: CyberQuery) {
    setSearch(q.search ?? '');
    setKind((q.kind ?? '') as LogSourceKind | '');
    setStatus((q.status ?? '') as LogSourceStatus | '');
  }

  const filtered = initialSources.filter((s) => {
    if (kind && s.kind !== kind) return false;
    if (status && s.status !== status) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !s.name.toLowerCase().includes(q) &&
        !((s.vendor ?? '').toLowerCase().includes(q)) &&
        !((s.endpointHint ?? '').toLowerCase().includes(q)) &&
        !((s.notes ?? '').toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  });

  const hasFilters = search.trim().length > 0 || kind !== '' || status !== '';

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
      <CyberListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Name, vendor, endpoint, notes…"
        filters={{ kind, status }}
        onApplyQuery={applyQuery}
        savedViewKey="log-sources"
        filterControls={
          <>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Kind
              </span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as LogSourceKind | '')}
                className={selectCls}
              >
                <option value="">All</option>
                {LOG_SOURCE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Status
              </span>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as LogSourceStatus | '')
                }
                className={selectCls}
              >
                <option value="">All</option>
                {LOG_SOURCE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        actions={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setCreating((c) => !c);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium px-3 py-2 text-sm transition"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Close' : 'New source'}
          </button>
        }
      />

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
        <EmptyState
          icon={<Database className="h-6 w-6" />}
          title={
            hasFilters
              ? 'No log sources match these filters'
              : 'No log sources yet'
          }
          description={
            hasFilters
              ? 'Try a broader search or clear a filter to see more sources.'
              : 'Catalogue every SIEM, EDR, IDS, cloud-audit, and firewall feed that produces alerts.'
          }
          primaryCta={
            hasFilters
              ? undefined
              : {
                  label: 'New source',
                  icon: <Plus className="h-4 w-4" />,
                  onClick: () => {
                    setEditing(null);
                    setCreating(true);
                  },
                }
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4"
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
                <p className="text-xs text-text-secondary">
                  {s.kind}
                  {s.vendor && ` · ${s.vendor}`}
                  {s.endpointHint && ` · ${s.endpointHint}`}
                </p>
                {s.notes && (
                  <p className="text-xs text-text-secondary mt-1 line-clamp-2">{s.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setEditing(s);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-border-subtle text-text-primary hover:text-white px-2 py-1 text-xs transition"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(s)}
                  disabled={busy === s.id}
                  className="inline-flex items-center gap-1 rounded border border-border-subtle text-danger hover:text-danger/80 disabled:opacity-60 px-2 py-1 text-xs transition"
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
