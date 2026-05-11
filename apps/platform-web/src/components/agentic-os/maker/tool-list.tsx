'use client';

/**
 * Maker OS — ToolList.
 *
 * Workshop-global tools list view. Filterable by status / kind / tag, with
 * a compose form for adding new tools. Each row links to its detail page
 * (`/dashboard/os/maker/tools/[toolId]`).
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TOOL_KINDS,
  TOOL_KIND_LABELS,
  TOOL_STATUS_VALUES,
  TOOL_STATUS_LABELS,
  summarizeTools,
  type Tool,
  type ToolKind,
  type ToolStatus,
} from '@/lib/agentic-os/maker/tools';

const API_BASE = '/api/tiresias/agentic-os/maker/tools';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

const STATUS_BADGE: Record<ToolStatus, string> = {
  active: 'border-emerald-500/50 text-emerald-300 bg-emerald-500/5',
  down: 'border-amber-500/50 text-amber-300 bg-amber-500/5',
  retired: 'border-[#2a2d3e] text-[#94a3b8] bg-[#0f1117]',
};

interface Props {
  initialTools: Tool[];
}

export function ToolList({ initialTools }: Props) {
  const [tools, setTools] = useState<Tool[]>(initialTools);
  const [status, setStatus] = useState<ToolStatus | ''>('');
  const [kind, setKind] = useState<ToolKind | ''>('');
  const [tag, setTag] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    kind: 'other' as ToolKind,
    manufacturer: '',
    model: '',
    location: '',
    tagsRaw: '',
  });

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (kind) params.set('kind', kind);
    if (tag.trim()) params.set('tag', tag.trim());
    const r = await fetch(`${API_BASE}?${params.toString()}`);
    if (r.ok) {
      const { tools: latest } = await r.json();
      setTools(latest ?? []);
    }
  }, [status, kind, tag]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = summarizeTools(tools);

  async function addTool(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setAddError('Name is required.');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const tags = draft.tagsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
      const r = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          kind: draft.kind,
          manufacturer: draft.manufacturer.trim() || null,
          model: draft.model.trim() || null,
          location: draft.location.trim() || null,
          tags,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      setDraft({
        name: '',
        kind: 'other',
        manufacturer: '',
        model: '',
        location: '',
        tagsRaw: '',
      });
      setShowAdd(false);
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[#94a3b8]">
        <span>
          <strong className="text-white">{stats.total}</strong> tool
          {stats.total === 1 ? '' : 's'}
        </span>
        <span>·</span>
        <span className="text-emerald-300">{stats.active} active</span>
        <span>·</span>
        <span className="text-amber-300">{stats.down} down</span>
        <span>·</span>
        <span className="text-[#94a3b8]">{stats.retired} retired</span>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <select
          value={status}
          onChange={(e) => setStatus((e.target.value || '') as ToolStatus | '')}
          className={inputCls}
        >
          <option value="">All statuses</option>
          {TOOL_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {TOOL_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={(e) => setKind((e.target.value || '') as ToolKind | '')}
          className={inputCls}
        >
          <option value="">All kinds</option>
          {TOOL_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Tag…"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className={`${inputCls} sm:col-span-1`}
        />
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-md border border-[#4361EE] bg-[#4361EE]/10 px-3 py-2 text-sm text-white hover:bg-[#4361EE]/20 transition"
        >
          {showAdd ? 'Cancel' : '+ New tool'}
        </button>
      </div>

      {/* Compose */}
      {showAdd && (
        <form
          onSubmit={addTool}
          className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Name (required)"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputCls}
              required
            />
            <select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as ToolKind })}
              className={inputCls}
            >
              {TOOL_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Manufacturer"
              value={draft.manufacturer}
              onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })}
              className={inputCls}
            />
            <input
              type="text"
              placeholder="Model"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              className={inputCls}
            />
            <input
              type="text"
              placeholder="Location"
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              className={inputCls}
            />
            <input
              type="text"
              placeholder="Tags (comma-separated)"
              value={draft.tagsRaw}
              onChange={(e) => setDraft({ ...draft, tagsRaw: e.target.value })}
              className={inputCls}
            />
          </div>
          {addError && (
            <p className="text-xs text-red-400">{addError}</p>
          )}
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-[#4361EE] px-4 py-2 text-sm font-medium text-white hover:bg-[#4361EE]/80 disabled:opacity-50 transition"
          >
            {adding ? 'Adding…' : 'Add tool'}
          </button>
        </form>
      )}

      {/* List */}
      {tools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27]/50 p-8 text-center">
          <p className="text-sm text-[#94a3b8]">
            No tools match the current filters. Add your first tool with the button above.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-[#2a2d3e] bg-[#0f1117]/50">
              <tr className="text-left text-xs uppercase tracking-wide text-[#94a3b8]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-[#2a2d3e] last:border-b-0 hover:bg-[#0f1117]/30 transition"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/os/maker/tools/${t.id}`}
                      className="text-white hover:text-[#4361EE] transition font-medium"
                    >
                      {t.name}
                    </Link>
                    {(t.manufacturer || t.model) && (
                      <div className="text-[10px] text-[#94a3b8]">
                        {t.manufacturer ?? ''}
                        {t.manufacturer && t.model ? ' · ' : ''}
                        {t.model ?? ''}
                      </div>
                    )}
                    {t.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#cbd5e1]">{TOOL_KIND_LABELS[t.kind]}</td>
                  <td className="px-4 py-3 text-[#cbd5e1]">{t.location ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_BADGE[t.status]}`}
                    >
                      {TOOL_STATUS_LABELS[t.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
