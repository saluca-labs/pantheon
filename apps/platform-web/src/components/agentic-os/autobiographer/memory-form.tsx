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
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-2xl bg-[#1a1d27] rounded-xl border border-[#2a2d3e] p-5 space-y-4 my-8"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit memory' : 'New memory'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#94a3b8] hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-[#94a3b8]">
            Title<span className="text-red-400">*</span>
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={500}
            className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
            placeholder="A short title for this memory"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-[#94a3b8]">
            Memory<span className="text-red-400">*</span>{' '}
            <span className="text-[#64748b] normal-case">(markdown)</span>
          </span>
          <textarea
            value={bodyMarkdown}
            onChange={(e) => setBodyMarkdown(e.target.value)}
            required
            rows={6}
            maxLength={200_000}
            className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE] font-mono"
            placeholder="What happened? Where? Who was there?"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-[#94a3b8]">
              When in life
            </span>
            <input
              value={whenInLife}
              onChange={(e) => setWhenInLife(e.target.value)}
              maxLength={500}
              className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
              placeholder='e.g. "around 1985", "high school years"'
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-[#94a3b8]">
              Era date estimate
            </span>
            <input
              type="date"
              value={eraDateEstimate}
              onChange={(e) => setEraDateEstimate(e.target.value)}
              className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-[#94a3b8]">
            Location
          </span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={500}
            className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
            placeholder={'e.g. "Albuquerque, NM" or "Grandma\'s kitchen"'}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-[#94a3b8]">
              Content tags (comma-separated)
            </span>
            <input
              value={contentTagsInput}
              onChange={(e) => setContentTagsInput(e.target.value)}
              className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
              placeholder="family, work, first-love"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-[#94a3b8]">
              Emotion tags (comma-separated)
            </span>
            <input
              value={emotionTagsInput}
              onChange={(e) => setEmotionTagsInput(e.target.value)}
              className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
              placeholder="grief, joy, pride"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!lockedBookId && (
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-[#94a3b8]">
                Attach to book
              </span>
              <select
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
                className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
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
            <span className="text-xs uppercase tracking-wide text-[#94a3b8]">
              Source
            </span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as MemorySource)}
              className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
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
          <span className="text-xs uppercase tracking-wide text-[#94a3b8]">
            Audio URL
          </span>
          <input
            type="url"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            maxLength={2000}
            className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
            placeholder="https://... (MCP-mediated storage transfer)"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-[#94a3b8]">
            Transcript
          </span>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            maxLength={500_000}
            className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
            placeholder="Paste a transcript of any audio capture here."
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-[#94a3b8]">
            Photo URLs <span className="text-[#64748b] normal-case">(one per line)</span>
          </span>
          <textarea
            value={photoUrlsInput}
            onChange={(e) => setPhotoUrlsInput(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-[#0f1117] border border-[#2a2d3e] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4361EE]"
            placeholder="https://..."
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-[#cbd5e1]">
          <input
            type="checkbox"
            checked={isSensitive}
            onChange={(e) => setIsSensitive(e.target.checked)}
            className="rounded border-[#2a2d3e] bg-[#0f1117]"
          />
          Mark as sensitive (flagged for Phase 6 privacy review)
        </label>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded border border-[#2a2d3e] text-[#cbd5e1] hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim() || !bodyMarkdown.trim()}
            className="text-sm px-4 py-1.5 rounded bg-[#4361EE] text-white font-medium disabled:opacity-50 hover:bg-[#3a52d8] transition"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save' : 'Capture memory'}
          </button>
        </div>
      </form>
    </div>
  );
}
