'use client';

/**
 * Maker OS — ReferenceList.
 *
 * Workshop-global reference library list view. Filterable by kind / tag
 * (server refetch) plus — Wave C-3a — a client-side in-hub search over the
 * loaded rows and saved filter presets, with an inline compose form for
 * adding new references.
 *
 * Wave C-3a primitive adoption:
 *  - `MakerListControls` (EntitySearch + SavedViews) wraps the search input;
 *    the native kind / tag controls move into its `filterControls` slot.
 *  - `EmptyState` replaces the ad-hoc "No references…" dashed panel.
 *
 * Behavior-preserving: the kind / tag server-refetch loop, the compose form
 * (`ReferenceForm`), and the delete flow are unchanged.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import {
  REFERENCE_KIND_VALUES,
  REFERENCE_KIND_LABELS,
  summarizeReferences,
  type Reference,
  type ReferenceKind,
} from '@/lib/agentic-os/maker/references';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import { ReferenceForm } from './reference-form';
import { MakerListControls, type MakerQuery } from './maker-list-controls';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const API_BASE = '/api/tiresias/agentic-os/maker/references';

/**
 * Client-side free-text search over a reference's title, authors, and tags.
 * Pure + exported so the search behavior is unit-testable.
 */
export function matchesReferenceSearch(r: Reference, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    r.title.toLowerCase().includes(q) ||
    (r.authors ?? '').toLowerCase().includes(q) ||
    r.tags.some((t) => t.toLowerCase().includes(q))
  );
}

interface Props {
  initialReferences: Reference[];
}

export function ReferenceList({ initialReferences }: Props) {
  const [refs, setRefs] = useState<Reference[]>(initialReferences);
  const [kind, setKind] = useState<ReferenceKind | ''>('');
  const [tag, setTag] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
    if (tag.trim()) params.set('tag', tag.trim());
    const r = await fetch(`${API_BASE}?${params.toString()}`);
    if (r.ok) {
      const { references } = await r.json();
      setRefs(references ?? []);
    }
  }, [kind, tag]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => refs.filter((r) => matchesReferenceSearch(r, search)),
    [refs, search],
  );

  const stats = summarizeReferences(visible);

  async function handleDelete(id: string) {
    if (!confirm('Delete this reference? Linked projects will lose the reference.'))
      return;
    try {
      const r = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Delete failed (${r.status})`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  const filters = useMemo<MakerQuery>(
    () => ({ kind: kind || '', tag }),
    [kind, tag],
  );

  function applyQuery(q: MakerQuery) {
    setKind((q.kind as ReferenceKind) || '');
    setTag(q.tag ?? '');
    setSearch(q.search ?? '');
  }

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        <span>
          <strong className="text-white">{stats.total}</strong> reference
          {stats.total === 1 ? '' : 's'}
        </span>
        {REFERENCE_KIND_VALUES.filter((k) => stats.byKind[k] > 0).map((k) => (
          <span key={k}>
            · {stats.byKind[k]} {REFERENCE_KIND_LABELS[k].toLowerCase()}
          </span>
        ))}
      </div>

      {/* Search + saved views + native filter controls */}
      <MakerListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search references by title, author, or tag"
        filters={filters}
        onApplyQuery={applyQuery}
        savedViewKey="references"
        filterControls={
          <>
            <select
              value={kind}
              onChange={(e) => setKind((e.target.value || '') as ReferenceKind | '')}
              className={`${inputCls} sm:w-44`}
            >
              <option value="">All kinds</option>
              {REFERENCE_KIND_VALUES.map((k) => (
                <option key={k} value={k}>
                  {REFERENCE_KIND_LABELS[k]}
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
            {showAdd ? 'Cancel' : '+ New reference'}
          </button>
        }
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      {showAdd && (
        <ReferenceForm
          onCreated={() => {
            setShowAdd(false);
            void load();
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* List */}
      {visible.length === 0 ? (
        refs.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No references yet"
            description="Build a workshop-global library of papers, tutorials, standards, articles, videos, and links — then attach them to the projects that use them."
            primaryCta={{
              label: 'New reference',
              onClick: () => setShowAdd(true),
            }}
          />
        ) : (
          <EmptyState
            variant="bare"
            icon={<BookOpen className="h-6 w-6" />}
            title="No references match"
            description="Try clearing the search or adjusting the kind and tag filters."
          />
        )
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border-subtle bg-surface-0/50">
              <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Authors</th>
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 font-medium">URL</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-0/30 transition"
                >
                  <td className="px-4 py-3 text-white font-medium">
                    {r.title}
                    {r.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-primary">
                    {REFERENCE_KIND_LABELS[r.kind]}
                  </td>
                  <td className="px-4 py-3 text-text-primary">{r.authors ?? '—'}</td>
                  <td className="px-4 py-3 text-text-primary">{r.publishedAt ?? '—'}</td>
                  <td className="px-4 py-3">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline text-xs"
                    >
                      Open
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      className="text-xs text-text-secondary hover:text-red-400 transition"
                    >
                      Delete
                    </button>
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
