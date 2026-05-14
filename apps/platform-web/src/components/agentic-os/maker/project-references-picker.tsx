'use client';

/**
 * Maker OS — ProjectReferencesPicker.
 *
 * Used on the project hub References tab. Renders the linked references
 * for one project, with an "Add reference" affordance that opens a modal
 * for picking from the global library (or creating a brand-new reference
 * inline).
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  REFERENCE_KIND_LABELS,
  type ProjectReferenceJoined,
  type Reference,
} from '@/lib/agentic-os/maker/references';
import { ReferenceForm } from './reference-form';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

interface Props {
  projectId: string;
  initialLinks: ProjectReferenceJoined[];
  initialLibrary: Reference[];
}

export function ProjectReferencesPicker({
  projectId,
  initialLinks,
  initialLibrary,
}: Props) {
  const [links, setLinks] = useState<ProjectReferenceJoined[]>(initialLinks);
  const [library, setLibrary] = useState<Reference[]>(initialLibrary);
  const [showPicker, setShowPicker] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [linksRes, libRes] = await Promise.all([
      fetch(`/api/tiresias/agentic-os/maker/projects/${projectId}/references`),
      fetch('/api/tiresias/agentic-os/maker/references'),
    ]);
    if (linksRes.ok) {
      const { references } = await linksRes.json();
      setLinks(references ?? []);
    }
    if (libRes.ok) {
      const { references } = await libRes.json();
      setLibrary(references ?? []);
    }
  }, [projectId]);

  useEffect(() => {
    // Sync once on mount; subsequent edits trigger refresh manually.
    void refresh();
  }, [refresh]);

  const linkedIds = new Set(links.map((l) => l.referenceId));
  const filteredLibrary = library
    .filter((r) => !linkedIds.has(r.id))
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        (r.authors?.toLowerCase().includes(q) ?? false) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
      );
    });

  async function attach(referenceId: string) {
    setPendingId(referenceId);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/maker/projects/${projectId}/references`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference_id: referenceId }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link');
    } finally {
      setPendingId(null);
    }
  }

  async function detach(referenceId: string) {
    if (!confirm('Unlink this reference from the project? (The reference stays in your library.)'))
      return;
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/maker/projects/${projectId}/references/${referenceId}`,
        { method: 'DELETE' },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          className="rounded-md border border-accent bg-accent/10 px-3 py-2 text-sm text-white hover:bg-accent/20 transition"
        >
          {showPicker ? 'Close picker' : '+ Link reference'}
        </button>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary hover:text-white transition"
        >
          {showCreate ? 'Cancel' : '+ Create new reference'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {showCreate && (
        <ReferenceForm
          onCreated={async (ref) => {
            setShowCreate(false);
            // Auto-link the freshly-created reference to the project.
            await attach(ref.id);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {showPicker && (
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3">
          <input
            type="text"
            placeholder="Search library by title / author / tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
          />
          {filteredLibrary.length === 0 ? (
            <p className="text-xs text-text-secondary">
              {library.length === 0
                ? 'Your library is empty. Use “Create new reference” to add the first.'
                : 'No matching unlinked references.'}
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle max-h-72 overflow-y-auto">
              {filteredLibrary.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">{r.title}</div>
                    <div className="text-[10px] text-text-secondary truncate">
                      {REFERENCE_KIND_LABELS[r.kind]}
                      {r.authors ? ` · ${r.authors}` : ''}
                      {r.publishedAt ? ` · ${r.publishedAt}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => attach(r.id)}
                    disabled={pendingId === r.id}
                    className="text-xs text-accent hover:underline disabled:opacity-50"
                  >
                    {pendingId === r.id ? 'Linking…' : 'Link'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Linked references list */}
      {links.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-2/50 p-8 text-center">
          <p className="text-sm text-text-secondary">
            No references linked to this project yet.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border-subtle bg-surface-0/50">
              <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Authors</th>
                <th className="px-4 py-3 font-medium">URL</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-0/30 transition"
                >
                  <td className="px-4 py-3 text-white font-medium">
                    {l.referenceTitle}
                  </td>
                  <td className="px-4 py-3 text-text-primary">
                    {REFERENCE_KIND_LABELS[l.referenceKind]}
                  </td>
                  <td className="px-4 py-3 text-text-primary">
                    {l.referenceAuthors ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={l.referenceUrl}
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
                      onClick={() => detach(l.referenceId)}
                      className="text-xs text-text-secondary hover:text-red-400 transition"
                    >
                      Unlink
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
