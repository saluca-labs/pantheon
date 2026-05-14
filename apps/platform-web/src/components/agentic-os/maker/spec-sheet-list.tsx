'use client';

/**
 * Maker OS — SpecSheetList.
 *
 * Reusable list view for spec sheets. Used by:
 *   - the workshop-global /dashboard/os/maker/spec-sheets page,
 *   - the project detail Specs tab (scoped to one project),
 *   - the tool detail page Spec sheets section (scoped to one tool).
 *
 * Pass an explicit `scope` to lock the attachment column the inline form
 * writes to. When `scope.attachmentKind === 'workshop'` the form exposes
 * a picker so the operator chooses part / tool / project per row.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SPEC_SHEET_KIND_VALUES,
  SPEC_SHEET_KIND_LABELS,
  type SpecSheet,
  type SpecSheetKind,
  type SpecSheetAttachment,
  specSheetAttachment,
  SPEC_SHEET_ATTACHMENT_LABELS,
} from '@/lib/agentic-os/maker/spec-sheets';
import { SpecSheetForm } from './spec-sheet-form';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export type SpecSheetScope =
  | { kind: 'workshop' }
  | { kind: 'part'; partId: string }
  | { kind: 'tool'; toolId: string }
  | { kind: 'project'; projectId: string };

interface Props {
  scope: SpecSheetScope;
  initialSheets: SpecSheet[];
  /** When `true`, hide the inline create form (read-only view). */
  readOnly?: boolean;
}

function endpointFor(scope: SpecSheetScope): string {
  switch (scope.kind) {
    case 'workshop':
      return '/api/tiresias/agentic-os/maker/spec-sheets';
    case 'part':
      return `/api/tiresias/agentic-os/maker/catalog/${scope.partId}/spec-sheets`;
    case 'tool':
      return `/api/tiresias/agentic-os/maker/tools/${scope.toolId}/spec-sheets`;
    case 'project':
      // Read scope: filter the canonical list by projectId; for create we
      // route through the canonical endpoint and supply projectId in the
      // payload so the polymorphic-attachment CHECK accepts it.
      return '/api/tiresias/agentic-os/maker/spec-sheets';
  }
}

export function SpecSheetList({ scope, initialSheets, readOnly = false }: Props) {
  const [sheets, setSheets] = useState<SpecSheet[]>(initialSheets);
  const [kind, setKind] = useState<SpecSheetKind | ''>('');
  const [attachment, setAttachment] = useState<SpecSheetAttachment | ''>('');
  const [tag, setTag] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const url = new URL(endpointFor(scope), window.location.origin);
    if (kind) url.searchParams.set('kind', kind);
    if (tag.trim()) url.searchParams.set('tag', tag.trim());
    if (scope.kind === 'workshop' && attachment) {
      url.searchParams.set('attachment', attachment);
    }
    if (scope.kind === 'project') {
      url.searchParams.set('project_id', scope.projectId);
    }
    const r = await fetch(url.toString());
    if (r.ok) {
      const { specSheets } = await r.json();
      setSheets(specSheets ?? []);
    }
  }, [scope, kind, tag, attachment]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => sheets, [sheets]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this spec sheet?')) return;
    try {
      const r = await fetch(`/api/tiresias/agentic-os/maker/spec-sheets/${id}`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Delete failed (${r.status})`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={kind}
          onChange={(e) => setKind((e.target.value || '') as SpecSheetKind | '')}
          className={`${inputCls} max-w-[160px]`}
        >
          <option value="">All kinds</option>
          {SPEC_SHEET_KIND_VALUES.map((k) => (
            <option key={k} value={k}>
              {SPEC_SHEET_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {scope.kind === 'workshop' && (
          <select
            value={attachment}
            onChange={(e) =>
              setAttachment((e.target.value || '') as SpecSheetAttachment | '')
            }
            className={`${inputCls} max-w-[180px]`}
          >
            <option value="">All attachments</option>
            <option value="part">Attached to part</option>
            <option value="tool">Attached to tool</option>
            <option value="project">Attached to project</option>
          </select>
        )}
        <input
          type="text"
          placeholder="Tag…"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className={`${inputCls} max-w-[160px]`}
        />
        <div className="ml-auto">
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="rounded-md border border-accent bg-accent/10 px-3 py-2 text-sm text-white hover:bg-accent/20 transition"
            >
              {showAdd ? 'Cancel' : '+ Add spec sheet'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {showAdd && !readOnly && (
        <SpecSheetForm
          scope={scope}
          onCreated={() => {
            setShowAdd(false);
            void load();
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-2/50 p-8 text-center">
          <p className="text-sm text-text-secondary">
            No spec sheets yet.
            {!readOnly && ' Add your first one with the button above.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border-subtle bg-surface-0/50">
              <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Attached to</th>
                <th className="px-4 py-3 font-medium">Revision</th>
                <th className="px-4 py-3 font-medium">URL</th>
                {!readOnly && <th className="px-4 py-3 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const att = specSheetAttachment(s);
                return (
                  <tr
                    key={s.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-0/30 transition"
                  >
                    <td className="px-4 py-3 text-white font-medium">
                      {s.title}
                      {s.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {s.tags.map((t) => (
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
                      {SPEC_SHEET_KIND_LABELS[s.kind]}
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {att ? SPEC_SHEET_ATTACHMENT_LABELS[att] : '—'}
                    </td>
                    <td className="px-4 py-3 text-text-primary">{s.revision ?? '—'}</td>
                    <td className="px-4 py-3">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline text-xs"
                      >
                        Open
                      </a>
                    </td>
                    {!readOnly && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(s.id)}
                          className="text-xs text-text-secondary hover:text-red-400 transition"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
