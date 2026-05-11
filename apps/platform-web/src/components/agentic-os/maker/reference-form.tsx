'use client';

/**
 * Maker OS — ReferenceForm.
 *
 * Inline create form for a reference. Used by ReferenceList (workshop) and
 * ProjectReferencesPicker ("Create new" affordance).
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import { useState } from 'react';
import {
  REFERENCE_KIND_VALUES,
  REFERENCE_KIND_LABELS,
  type Reference,
  type ReferenceKind,
} from '@/lib/agentic-os/maker/references';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

interface Props {
  /** Called with the new reference after a successful POST. */
  onCreated?: (reference: Reference) => void;
  onCancel?: () => void;
}

export function ReferenceForm({ onCreated, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<ReferenceKind>('link');
  const [authors, setAuthors] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    setSubmitting(true);
    try {
      const r = await fetch('/api/tiresias/agentic-os/maker/references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          url: url.trim(),
          kind,
          authors: authors.trim() || null,
          publisher: publisher.trim() || null,
          publishedAt: publishedAt.trim() || null,
          notes: notes.trim() || null,
          tags,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { reference } = await r.json();
      onCreated?.(reference);
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
          onChange={(e) => setKind(e.target.value as ReferenceKind)}
          className={inputCls}
        >
          {REFERENCE_KIND_VALUES.map((k) => (
            <option key={k} value={k}>
              {REFERENCE_KIND_LABELS[k]}
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
          placeholder="Authors"
          value={authors}
          onChange={(e) => setAuthors(e.target.value)}
          className={inputCls}
        />
        <input
          type="text"
          placeholder="Publisher"
          value={publisher}
          onChange={(e) => setPublisher(e.target.value)}
          className={inputCls}
        />
        <input
          type="date"
          placeholder="Published"
          value={publishedAt}
          onChange={(e) => setPublishedAt(e.target.value)}
          className={inputCls}
        />
        <input
          type="text"
          placeholder="Tags (comma-separated)"
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          className={inputCls}
        />
        <textarea
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${inputCls} sm:col-span-2`}
          rows={3}
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[#4361EE] px-4 py-2 text-sm font-medium text-white hover:bg-[#4361EE]/80 disabled:opacity-50 transition"
        >
          {submitting ? 'Saving…' : 'Add reference'}
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
