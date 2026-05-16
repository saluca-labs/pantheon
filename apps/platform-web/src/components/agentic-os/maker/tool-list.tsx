'use client';

/**
 * Maker OS — ToolList.
 *
 * Workshop-global tools list view. Filterable by status / kind / tag (these
 * three drive a server refetch), plus — Wave C-3a — a client-side in-hub
 * search over the loaded rows and saved filter presets. Each row links to
 * its detail page (`/dashboard/os/maker/tools/[toolId]`).
 *
 * Wave C-3a primitive adoption:
 *  - `MakerListControls` (EntitySearch + SavedViews) wraps the search input;
 *    the native status / kind / tag selects move into its `filterControls`
 *    slot. Search is client-side over the server-filtered rows.
 *  - `EmptyState` replaces the ad-hoc "No tools…" dashed panel.
 *
 * Behavior-preserving: the status / kind / tag server-refetch loop is
 * unchanged; the compose form and detail-page links are untouched.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Wrench } from 'lucide-react';
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
import { EmptyState } from '@/components/agentic-os/_shared/views';
import { MakerListControls, type MakerQuery } from './maker-list-controls';

const API_BASE = '/api/tiresias/agentic-os/maker/tools';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const STATUS_BADGE: Record<ToolStatus, string> = {
  active: 'border-positive/50 text-positive bg-positive/5',
  down: 'border-warning/50 text-warning bg-warning/5',
  retired: 'border-border-subtle text-text-secondary bg-surface-0',
};

/**
 * Client-side free-text search over a tool's name, manufacturer, model, and
 * tags. Pure + exported so the search behavior is unit-testable.
 */
export function matchesToolSearch(t: Tool, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    t.name.toLowerCase().includes(q) ||
    (t.manufacturer ?? '').toLowerCase().includes(q) ||
    (t.model ?? '').toLowerCase().includes(q) ||
    t.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}

interface Props {
  initialTools: Tool[];
}

export function ToolList({ initialTools }: Props) {
  const [tools, setTools] = useState<Tool[]>(initialTools);
  const [status, setStatus] = useState<ToolStatus | ''>('');
  const [kind, setKind] = useState<ToolKind | ''>('');
  const [tag, setTag] = useState('');
  const [search, setSearch] = useState('');
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

  // Server-filtered rows narrowed further by the client-side search input.
  const visible = useMemo(
    () => tools.filter((t) => matchesToolSearch(t, search)),
    [tools, search],
  );

  const stats = summarizeTools(visible);

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

  // Saved-view query carries the server-side filters + the client search.
  const filters = useMemo<MakerQuery>(
    () => ({ status: status || '', kind: kind || '', tag }),
    [status, kind, tag],
  );

  function applyQuery(q: MakerQuery) {
    setStatus((q.status as ToolStatus) || '');
    setKind((q.kind as ToolKind) || '');
    setTag(q.tag ?? '');
    setSearch(q.search ?? '');
  }

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        <span>
          <strong className="text-white">{stats.total}</strong> tool
          {stats.total === 1 ? '' : 's'}
        </span>
        <span>·</span>
        <span className="text-positive">{stats.active} active</span>
        <span>·</span>
        <span className="text-warning">{stats.down} down</span>
        <span>·</span>
        <span className="text-text-secondary">{stats.retired} retired</span>
      </div>

      {/* Search + saved views + native filter selects */}
      <MakerListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search tools by name, maker, model, or tag"
        filters={filters}
        onApplyQuery={applyQuery}
        savedViewKey="tools"
        filterControls={
          <>
            <select
              value={status}
              onChange={(e) => setStatus((e.target.value || '') as ToolStatus | '')}
              className={`${inputCls} sm:w-44`}
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
              className={`${inputCls} sm:w-44`}
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
              className={`${inputCls} sm:w-36`}
            />
          </>
        }
        actions={
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-md border border-accent bg-accent/10 px-3 py-2 text-sm text-white hover:bg-accent/20 transition"
          >
            {showAdd ? 'Cancel' : '+ New tool'}
          </button>
        }
      />

      {/* Compose */}
      {showAdd && (
        <form
          onSubmit={addTool}
          className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3"
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
            <p className="text-xs text-danger">{addError}</p>
          )}
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80 disabled:opacity-50 transition"
          >
            {adding ? 'Adding…' : 'Add tool'}
          </button>
        </form>
      )}

      {/* List */}
      {visible.length === 0 ? (
        tools.length === 0 ? (
          <EmptyState
            icon={<Wrench className="h-6 w-6" />}
            title="No tools yet"
            description="Track every workshop tool — kind, location, status, consumable wear, and maintenance log — and link them to the projects that depend on them."
            primaryCta={{
              label: 'New tool',
              onClick: () => setShowAdd(true),
            }}
          />
        ) : (
          <EmptyState
            variant="bare"
            icon={<Wrench className="h-6 w-6" />}
            title="No tools match"
            description="Try clearing the search or adjusting the status, kind, and tag filters."
          />
        )
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border-subtle bg-surface-0/50">
              <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-0/30 transition"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/os/maker/tools/${t.id}`}
                      className="text-white hover:text-accent transition font-medium"
                    >
                      {t.name}
                    </Link>
                    {(t.manufacturer || t.model) && (
                      <div className="text-[10px] text-text-secondary">
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
                            className="text-[9px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-primary">{TOOL_KIND_LABELS[t.kind]}</td>
                  <td className="px-4 py-3 text-text-primary">{t.location ?? '—'}</td>
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
