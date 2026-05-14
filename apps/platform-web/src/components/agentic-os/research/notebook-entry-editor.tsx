'use client';

/**
 * Research OS Phase 2 — Entry editor.
 *
 * The full editor — kind picker + title + markdown body + URL list +
 * tag input + entry_at picker. Used by both the pinned composer (when
 * creating) and the in-card edit affordance (when patching). Submits
 * via the supplied `onSubmit` callback so the parent can decide whether
 * to POST (create) or PATCH (update).
 *
 * The body textarea is plain — no WYSIWYG. We render the markdown via
 * react-markdown elsewhere (card preview, full-render mode). Raw HTML
 * is not allowed (no rehype-raw).
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import {
  ENTRY_KINDS,
  ENTRY_KIND_LABELS,
  ENTRY_KIND_COLOR,
  type EntryKind,
} from '@/lib/agentic-os/research/entry-kinds';

export interface NotebookEntryEditorValue {
  entryKind: EntryKind;
  title: string;
  bodyMd: string;
  attachedUrls: string[];
  tags: string[];
  /** ISO-8601; empty string = "use now()" */
  entryAt: string;
}

interface Props {
  /** Initial value; when omitted, the editor starts with defaults. */
  initial?: Partial<NotebookEntryEditorValue>;
  submitLabel?: string;
  submitting?: boolean;
  /** Error string to surface above the submit row. */
  error?: string | null;
  /** Called with the assembled body. */
  onSubmit: (value: NotebookEntryEditorValue) => void;
  /** Called when the user dismisses the editor (Cancel). */
  onCancel?: () => void;
}

function isoLocalNow(): string {
  // 'YYYY-MM-DDTHH:MM' for <input type="datetime-local">.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function isoFromLocal(value: string): string {
  // <input type="datetime-local"> emits a value without a TZ offset; treat
  // as the user's local zone and convert to UTC ISO.
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString();
}

function localFromIso(value: string | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NotebookEntryEditor({
  initial,
  submitLabel = 'Save entry',
  submitting,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const [kind, setKind] = useState<EntryKind>(initial?.entryKind ?? 'note');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.bodyMd ?? '');
  const [urls, setUrls] = useState<string[]>(initial?.attachedUrls ?? []);
  const [urlDraft, setUrlDraft] = useState('');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [entryAtLocal, setEntryAtLocal] = useState<string>(() =>
    initial?.entryAt ? localFromIso(initial.entryAt) : isoLocalNow(),
  );

  // Refresh form state when `initial` changes (e.g. opening the editor on
  // a different entry).
  useEffect(() => {
    setKind(initial?.entryKind ?? 'note');
    setTitle(initial?.title ?? '');
    setBody(initial?.bodyMd ?? '');
    setUrls(initial?.attachedUrls ?? []);
    setTags(initial?.tags ?? []);
    setEntryAtLocal(initial?.entryAt ? localFromIso(initial.entryAt) : isoLocalNow());
  }, [initial]);

  function addUrl() {
    const t = urlDraft.trim();
    if (!t) return;
    if (!/^https?:\/\//i.test(t)) return;
    if (urls.includes(t)) {
      setUrlDraft('');
      return;
    }
    setUrls([...urls, t]);
    setUrlDraft('');
  }

  function removeUrl(idx: number) {
    setUrls(urls.filter((_, i) => i !== idx));
  }

  function addTag() {
    const t = tagDraft.trim().toLowerCase();
    if (!t) return;
    if (tags.includes(t)) {
      setTagDraft('');
      return;
    }
    setTags([...tags, t]);
    setTagDraft('');
  }

  function removeTag(idx: number) {
    setTags(tags.filter((_, i) => i !== idx));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    onSubmit({
      entryKind: kind,
      title: title.trim(),
      bodyMd: body,
      attachedUrls: urls,
      tags,
      entryAt: isoFromLocal(entryAtLocal),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="notebook-entry-editor">
      {/* Kind picker */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-secondary mr-1">
          Kind
        </span>
        {ENTRY_KINDS.map((k) => {
          const active = kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border transition ${
                active
                  ? ENTRY_KIND_COLOR[k]
                  : 'text-text-secondary bg-surface-0 border-border-subtle hover:text-white'
              }`}
              data-testid={`editor-kind-${k}`}
            >
              {ENTRY_KIND_LABELS[k]}
            </button>
          );
        })}
      </div>

      {/* Title */}
      <div>
        <label
          htmlFor="notebook-entry-title"
          className="text-[10px] font-medium uppercase tracking-wide text-text-secondary block mb-1"
        >
          Title
        </label>
        <input
          id="notebook-entry-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={300}
          placeholder="Short headline for this entry"
          className="w-full px-3 py-2 rounded bg-surface-0 border border-border-subtle text-white placeholder:text-text-secondary focus:outline-none focus:border-accent/60"
        />
      </div>

      {/* Body */}
      <div>
        <label
          htmlFor="notebook-entry-body"
          className="text-[10px] font-medium uppercase tracking-wide text-text-secondary block mb-1"
        >
          Body (markdown)
        </label>
        <textarea
          id="notebook-entry-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={50_000}
          placeholder="What happened, what you observed, why it matters…"
          className="w-full px-3 py-2 rounded bg-surface-0 border border-border-subtle text-white placeholder:text-text-secondary focus:outline-none focus:border-accent/60 font-mono text-xs leading-relaxed"
        />
        <p className="mt-1 text-[10px] text-text-secondary">
          Standard markdown. Raw HTML is not rendered.
        </p>
      </div>

      {/* Attached URLs */}
      <div>
        <label className="text-[10px] font-medium uppercase tracking-wide text-text-secondary block mb-1">
          Attached URLs
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addUrl();
              }
            }}
            placeholder="https://…"
            className="flex-1 px-3 py-1.5 rounded bg-surface-0 border border-border-subtle text-white text-xs placeholder:text-text-secondary focus:outline-none focus:border-accent/60"
            data-testid="editor-url-input"
          />
          <button
            type="button"
            onClick={addUrl}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs border border-border-subtle bg-surface-0 text-text-primary hover:text-white hover:border-accent/40"
            data-testid="editor-url-add"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
        {urls.length > 0 && (
          <ul className="mt-2 space-y-1">
            {urls.map((u, idx) => (
              <li
                key={`${u}-${idx}`}
                className="flex items-center gap-2 text-xs text-text-primary"
              >
                <span className="flex-1 truncate">{u}</span>
                <button
                  type="button"
                  onClick={() => removeUrl(idx)}
                  className="text-text-secondary hover:text-rose-300"
                  aria-label={`Remove ${u}`}
                  data-testid={`editor-url-remove-${idx}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tags */}
      <div>
        <label className="text-[10px] font-medium uppercase tracking-wide text-text-secondary block mb-1">
          Tags
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="enzyme, kinetics, replicate-3"
            maxLength={60}
            className="flex-1 px-3 py-1.5 rounded bg-surface-0 border border-border-subtle text-white text-xs placeholder:text-text-secondary focus:outline-none focus:border-accent/60"
            data-testid="editor-tag-input"
          />
          <button
            type="button"
            onClick={addTag}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs border border-border-subtle bg-surface-0 text-text-primary hover:text-white hover:border-accent/40"
            data-testid="editor-tag-add"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((t, idx) => (
              <span
                key={`${t}-${idx}`}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-primary"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(idx)}
                  className="text-text-secondary hover:text-rose-300"
                  aria-label={`Remove tag ${t}`}
                  data-testid={`editor-tag-remove-${idx}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Entry-at */}
      <div>
        <label
          htmlFor="notebook-entry-at"
          className="text-[10px] font-medium uppercase tracking-wide text-text-secondary block mb-1"
        >
          Entry timestamp
        </label>
        <input
          id="notebook-entry-at"
          type="datetime-local"
          value={entryAtLocal}
          onChange={(e) => setEntryAtLocal(e.target.value)}
          className="px-3 py-1.5 rounded bg-surface-0 border border-border-subtle text-white text-xs focus:outline-none focus:border-accent/60"
          data-testid="editor-entry-at"
        />
        <p className="mt-1 text-[10px] text-text-secondary">
          Defaults to now. Backdate freely when transcribing from a paper journal.
        </p>
      </div>

      {error && (
        <p className="text-xs text-rose-300" data-testid="editor-error">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 rounded text-xs text-text-secondary hover:text-white"
            data-testid="editor-cancel"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="px-3 py-1.5 rounded text-xs font-medium bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="editor-submit"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
