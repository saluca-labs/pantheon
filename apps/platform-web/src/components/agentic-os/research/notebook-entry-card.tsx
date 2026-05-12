'use client';

/**
 * Research OS Phase 2 — Single timeline card.
 *
 * Renders one notebook entry with kind pill, title, entry_at, optional
 * tags, attached URLs, and the markdown body via react-markdown.
 * Provides inline edit (PATCH) + archive (DELETE) affordances; the
 * archive flow swaps in a confirmation step before firing the request.
 *
 * Markdown rendering: react-markdown with default plugins — no
 * rehype-raw — so raw HTML in `body_md` is rendered as escaped text
 * (the `<script>foo</script>` injection vector is neutralized).
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Pencil, Archive, Link as LinkIcon, Clock } from 'lucide-react';
import type { NotebookEntry } from '@/lib/agentic-os/research/notebook-entries';
import { NotebookEntryKindPill } from './notebook-entry-kind-pill';
import {
  NotebookEntryEditor,
  type NotebookEntryEditorValue,
} from './notebook-entry-editor';

interface Props {
  entry: NotebookEntry;
  /** Called after a successful PATCH; the parent should refresh. */
  onUpdated?: (entry: NotebookEntry) => void;
  /** Called after a successful DELETE (soft-archive). */
  onArchived?: (entry: NotebookEntry) => void;
}

function formatEntryAt(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NotebookEntryCard({ entry, onUpdated, onArchived }: Props) {
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  async function handlePatch(value: NotebookEntryEditorValue) {
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        entry_kind: value.entryKind,
        title: value.title,
        body_md: value.bodyMd,
        attached_urls: value.attachedUrls,
        tags: value.tags,
      };
      if (value.entryAt) body.entry_at = value.entryAt;

      const res = await fetch(`/api/tiresias/agentic-os/research/notebook/${entry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        setError(
          detail && typeof detail.error === 'string'
            ? detail.error
            : `Failed to update (${res.status})`,
        );
        return;
      }
      const data = await res.json();
      onUpdated?.(data.entry);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tiresias/agentic-os/research/notebook/${entry.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        setError(
          detail && typeof detail.error === 'string'
            ? detail.error
            : `Failed to archive (${res.status})`,
        );
        return;
      }
      const data = await res.json();
      onArchived?.(data.entry ?? entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
      setConfirmingArchive(false);
    }
  }

  if (editing) {
    return (
      <div
        className="rounded-xl border border-[#4361EE]/40 bg-[#1a1d27] p-4"
        data-testid={`notebook-entry-card-editing-${entry.id}`}
      >
        <NotebookEntryEditor
          initial={{
            entryKind: entry.entryKind,
            title: entry.title,
            bodyMd: entry.bodyMd,
            attachedUrls: entry.attachedUrls,
            tags: entry.tags,
            entryAt: entry.entryAt,
          }}
          submitLabel="Save changes"
          submitting={submitting}
          error={error}
          onSubmit={handlePatch}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
        />
      </div>
    );
  }

  return (
    <article
      className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4"
      data-testid={`notebook-entry-card-${entry.id}`}
    >
      <header className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <NotebookEntryKindPill kind={entry.entryKind} />
          <h3 className="text-base font-semibold text-white truncate">{entry.title}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="p-1.5 rounded text-[#94a3b8] hover:text-white hover:bg-[#0f1117]"
            aria-label="Edit entry"
            data-testid={`card-edit-${entry.id}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmingArchive((v) => !v)}
            className="p-1.5 rounded text-[#94a3b8] hover:text-rose-300 hover:bg-[#0f1117]"
            aria-label="Archive entry"
            data-testid={`card-archive-${entry.id}`}
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <p className="flex items-center gap-1 text-[10px] text-[#94a3b8] mb-3">
        <Clock className="w-3 h-3" />
        {formatEntryAt(entry.entryAt)}
      </p>

      {entry.bodyMd && (
        <div
          className="prose prose-invert prose-sm max-w-none text-[#cbd5e1] [&_a]:text-[#4361EE] [&_code]:text-[#94a3b8] [&_code]:bg-[#0f1117] [&_code]:px-1 [&_code]:rounded mb-3"
          data-testid={`card-body-${entry.id}`}
        >
          <ReactMarkdown>{entry.bodyMd}</ReactMarkdown>
        </div>
      )}

      {entry.attachedUrls.length > 0 && (
        <ul className="space-y-1 mb-3" data-testid={`card-urls-${entry.id}`}>
          {entry.attachedUrls.map((u) => (
            <li key={u} className="text-xs">
              <a
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#4361EE] hover:underline"
              >
                <LinkIcon className="w-3 h-3" />
                <span className="truncate">{u}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid={`card-tags-${entry.id}`}>
          {entry.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {confirmingArchive && (
        <div
          className="mt-3 pt-3 border-t border-[#2a2d3e] flex items-center justify-between gap-3"
          data-testid={`card-archive-confirm-${entry.id}`}
        >
          <p className="text-xs text-[#94a3b8]">
            Archive this entry? You can restore it from the timeline filter.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmingArchive(false)}
              disabled={submitting}
              className="text-xs text-[#94a3b8] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleArchive}
              disabled={submitting}
              className="text-xs px-2 py-1 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25"
              data-testid={`card-archive-confirm-yes-${entry.id}`}
            >
              {submitting ? 'Archiving…' : 'Archive'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-rose-300" data-testid={`card-error-${entry.id}`}>
          {error}
        </p>
      )}
    </article>
  );
}
