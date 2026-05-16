'use client';

/**
 * Autobiographer OS — MemoryForm.
 *
 * Create-and-edit modal for a memory capture. Phase 1 surfaces all of
 * the columns the migration plants: body markdown, optional transcript +
 * audio URL, photo URL list, when-in-life label + structured era date
 * estimate, location, sensitive flag, source, and the two tag lists.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import {
  MEMORY_SOURCES,
  MEMORY_SOURCE_LABELS,
  type MemorySource,
} from '@/lib/agentic-os/autobiographer/memories';

export interface MemoryFormInitial {
  id?: string;
  bookId?: string | null;
  title?: string;
  bodyMarkdown?: string;
  transcript?: string | null;
  audioUrl?: string | null;
  photoUrls?: string[];
  whenInLife?: string | null;
  eraDateEstimate?: string | null;
  location?: string | null;
  emotionTags?: string[];
  contentTags?: string[];
  isSensitive?: boolean;
  source?: MemorySource;
}

export interface BookOption {
  id: string;
  title: string;
}

export interface MemoryFormProps {
  open: boolean;
  onClose: () => void;
  initial?: MemoryFormInitial;
  books: BookOption[];
  /** Locked book context — disables the book picker (used on per-book "add memory"). */
  lockedBookId?: string | null;
}

export function MemoryForm({
  open,
  onClose,
  initial,
  books,
  lockedBookId,
}: MemoryFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [bodyMarkdown, setBodyMarkdown] = useState(initial?.bodyMarkdown ?? '');
  const [transcript, setTranscript] = useState(initial?.transcript ?? '');
  const [audioUrl, setAudioUrl] = useState(initial?.audioUrl ?? '');
  const [photoUrlsInput, setPhotoUrlsInput] = useState(
    (initial?.photoUrls ?? []).join('\n'),
  );
  const [whenInLife, setWhenInLife] = useState(initial?.whenInLife ?? '');
  const [eraDateEstimate, setEraDateEstimate] = useState(
    initial?.eraDateEstimate ?? '',
  );
  const [location, setLocation] = useState(initial?.location ?? '');
  const [bookId, setBookId] = useState<string>(
    lockedBookId ?? initial?.bookId ?? '',
  );
  const [contentTagsInput, setContentTagsInput] = useState(
    (initial?.contentTags ?? []).join(', '),
  );
  const [emotionTagsInput, setEmotionTagsInput] = useState(
    (initial?.emotionTags ?? []).join(', '),
  );
  const [isSensitive, setIsSensitive] = useState(initial?.isSensitive ?? false);
  const [source, setSource] = useState<MemorySource>(initial?.source ?? 'text');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isEdit = Boolean(initial?.id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const contentTags = contentTagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const emotionTags = emotionTagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const photoUrls = photoUrlsInput
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        title: title.trim(),
        bodyMarkdown,
        transcript: transcript.trim() || null,
        audioUrl: audioUrl.trim() || null,
        photoUrls,
        whenInLife: whenInLife.trim() || null,
        eraDateEstimate: eraDateEstimate || null,
        location: location.trim() || null,
        contentTags,
        emotionTags,
        isSensitive,
        source,
      };
      if (!isEdit) {
        // On create, include book if selected (lockedBookId or user choice).
        body.bookId = bookId || null;
      } else if (!lockedBookId) {
        // On edit (when not locked), allow reassignment / detach.
        body.bookId = bookId || null;
      }

      const url = isEdit
        ? `/api/tiresias/agentic-os/autobiographer/memories/${initial!.id}`
        : '/api/tiresias/agentic-os/autobiographer/memories';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      onClose();
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save memory');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit memory' : 'New memory'}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
    >
      {/* Backdrop — rendered as a button so keyboard users can dismiss
          via Enter / Space without an inline a11y disable. */}
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="relative w-full max-w-2xl bg-surface-2 rounded-xl border border-border-subtle p-5 space-y-4 my-8"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit memory' : 'New memory'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Title<span className="text-danger">*</span>
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={500}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="A short title for this memory"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Memory<span className="text-danger">*</span>{' '}
            <span className="text-text-tertiary normal-case">(markdown)</span>
          </span>
          <textarea
            value={bodyMarkdown}
            onChange={(e) => setBodyMarkdown(e.target.value)}
            required
            rows={6}
            maxLength={200_000}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent font-mono"
            placeholder="What happened? Where? Who was there?"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              When in life
            </span>
            <input
              value={whenInLife}
              onChange={(e) => setWhenInLife(e.target.value)}
              maxLength={500}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              placeholder='e.g. "around 1985", "high school years"'
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Era date estimate
            </span>
            <input
              type="date"
              value={eraDateEstimate}
              onChange={(e) => setEraDateEstimate(e.target.value)}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Location
          </span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={500}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder={'e.g. "Albuquerque, NM" or "Grandma\'s kitchen"'}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Content tags (comma-separated)
            </span>
            <input
              value={contentTagsInput}
              onChange={(e) => setContentTagsInput(e.target.value)}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              placeholder="family, work, first-love"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Emotion tags (comma-separated)
            </span>
            <input
              value={emotionTagsInput}
              onChange={(e) => setEmotionTagsInput(e.target.value)}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              placeholder="grief, joy, pride"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!lockedBookId && (
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-text-secondary">
                Attach to book
              </span>
              <select
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
                className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              >
                <option value="">Workshop (no book)</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Source
            </span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as MemorySource)}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            >
              {MEMORY_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {MEMORY_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Audio URL
          </span>
          <input
            type="url"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            maxLength={2000}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="https://... (MCP-mediated storage transfer)"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Transcript
          </span>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            maxLength={500_000}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="Paste a transcript of any audio capture here."
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Photo URLs <span className="text-text-tertiary normal-case">(one per line)</span>
          </span>
          <textarea
            value={photoUrlsInput}
            onChange={(e) => setPhotoUrlsInput(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="https://..."
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={isSensitive}
            onChange={(e) => setIsSensitive(e.target.checked)}
            className="rounded border-border-subtle bg-surface-0"
          />
          Mark as sensitive (flagged for Phase 6 privacy review)
        </label>

        {error && (
          <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded border border-border-subtle text-text-primary hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim() || !bodyMarkdown.trim()}
            className="text-sm px-4 py-1.5 rounded bg-accent text-white font-medium disabled:opacity-50 hover:bg-accent/90 transition"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save' : 'Capture memory'}
          </button>
        </div>
      </form>
    </div>
  );
}
