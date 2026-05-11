'use client';

/**
 * Maker OS — SpecSheetForm.
 *
 * Inline create form for spec sheets. The shape adapts to the surrounding
 * scope: when the scope is workshop-global, the operator picks the
 * attachment kind + the target part/tool/project; when the scope is
 * already attached to one entity (part / tool / project detail page),
 * those fields are hidden and locked.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import { useEffect, useState } from 'react';
import {
  SPEC_SHEET_KIND_VALUES,
  SPEC_SHEET_KIND_LABELS,
  SPEC_SHEET_ATTACHMENT_VALUES,
  SPEC_SHEET_ATTACHMENT_LABELS,
  type SpecSheetKind,
  type SpecSheetAttachment,
} from '@/lib/agentic-os/maker/spec-sheets';
import type { SpecSheetScope } from './spec-sheet-list';
import type { PartCatalogRow } from '@/lib/agentic-os/maker/catalog';
import type { Tool } from '@/lib/agentic-os/maker/tools';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

interface Props {
  scope: SpecSheetScope;
  onCreated?: () => void;
  onCancel?: () => void;
}

interface ProjectStub {
  id: string;
  name: string;
}

export function SpecSheetForm({ scope, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<SpecSheetKind>('datasheet');
  const [revision, setRevision] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');

  // Workshop-scope: operator chooses attachment + target id.
  const [attachmentKind, setAttachmentKind] = useState<SpecSheetAttachment>('part');
  const [targetId, setTargetId] = useState('');

  // Catalogs for the workshop picker (only loaded when needed).
  const [parts, setParts] = useState<PartCatalogRow[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [projects, setProjects] = useState<ProjectStub[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (scope.kind !== 'workshop') return;
    (async () => {
      try {
        if (attachmentKind === 'part' && parts.length === 0) {
          const r = await fetch('/api/tiresias/agentic-os/maker/catalog');
          if (r.ok) {
            const { catalog } = await r.json();
            setParts(catalog ?? []);
          }
        } else if (attachmentKind === 'tool' && tools.length === 0) {
          const r = await fetch('/api/tiresias/agentic-os/maker/tools');
          if (r.ok) {
            const { tools: t } = await r.json();
            setTools(t ?? []);
          }
        } else if (attachmentKind === 'project' && projects.length === 0) {
          const r = await fetch('/api/tiresias/agentic-os/maker/projects');
          if (r.ok) {
            const { projects: p } = await r.json();
            setProjects(p ?? []);
          }
        }
      } catch {
        /* picker load failures are silent — operator can still type a UUID manually */
      }
    })();
  }, [scope, attachmentKind, parts.length, tools.length, projects.length]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!url.trim()) {
      setError('URL is required.');
      return;
    }

    const tags = tagsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

    const body: Record<string, unknown> = {
      title: title.trim(),
      url: url.trim(),
      kind,
      revision: revision.trim() || null,
      issuedAt: issuedAt.trim() || null,
      notes: notes.trim() || null,
      tags,
    };

    let endpoint = '/api/tiresias/agentic-os/maker/spec-sheets';
    if (scope.kind === 'part') {
      endpoint = `/api/tiresias/agentic-os/maker/catalog/${scope.partId}/spec-sheets`;
    } else if (scope.kind === 'tool') {
      endpoint = `/api/tiresias/agentic-os/maker/tools/${scope.toolId}/spec-sheets`;
    } else if (scope.kind === 'project') {
      body.projectId = scope.projectId;
    } else {
      // workshop scope: send the operator-picked attachment.
      if (!targetId.trim()) {
        setError('Select a target part / tool / project.');
        return;
      }
      if (attachmentKind === 'part') body.partId = targetId;
      else if (attachmentKind === 'tool') body.toolId = targetId;
      else body.projectId = targetId;
    }

    setSubmitting(true);
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Title (required)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          required
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SpecSheetKind)}
          className={inputCls}
        >
          {SPEC_SHEET_KIND_VALUES.map((k) => (
            <option key={k} value={k}>
              {SPEC_SHEET_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <input
          type="url"
          placeholder="URL (required)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={`${inputCls} sm:col-span-2`}
          required
        />
        <input
          type="text"
          placeholder="Revision (e.g. Rev B)"
          value={revision}
          onChange={(e) => setRevision(e.target.value)}
          className={inputCls}
        />
        <input
          type="date"
          placeholder="Issued"
          value={issuedAt}
          onChange={(e) => setIssuedAt(e.target.value)}
          className={inputCls}
        />
        <input
          type="text"
          placeholder="Tags (comma-separated)"
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          className={`${inputCls} sm:col-span-2`}
        />
        <textarea
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${inputCls} sm:col-span-2`}
          rows={3}
        />
      </div>

      {scope.kind === 'workshop' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select
            value={attachmentKind}
            onChange={(e) => {
              setAttachmentKind(e.target.value as SpecSheetAttachment);
              setTargetId('');
            }}
            className={inputCls}
          >
            {SPEC_SHEET_ATTACHMENT_VALUES.map((a) => (
              <option key={a} value={a}>
                Attach to {SPEC_SHEET_ATTACHMENT_LABELS[a].toLowerCase()}
              </option>
            ))}
          </select>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className={inputCls}
            required
          >
            <option value="">— pick a {attachmentKind} —</option>
            {attachmentKind === 'part' &&
              parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            {attachmentKind === 'tool' &&
              tools.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            {attachmentKind === 'project' &&
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[#4361EE] px-4 py-2 text-sm font-medium text-white hover:bg-[#4361EE]/80 disabled:opacity-50 transition"
        >
          {submitting ? 'Saving…' : 'Add spec sheet'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[#2a2d3e] bg-[#0f1117] px-4 py-2 text-sm text-[#94a3b8] hover:text-white transition"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
