'use client';

/**
 * Autobiographer OS — VoiceSampleForm.
 *
 * Create-and-edit modal for a voice sample. Title is optional; the body
 * is the meat of the row. Word count is shown live as the author types
 * so they can decide whether the sample is meaty enough for analysis.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import {
  VOICE_SAMPLE_BODY_MAX,
  VOICE_SAMPLE_MIN_WORDS,
  countVoiceSampleWords,
} from '@/lib/agentic-os/autobiographer/voice-samples';

export interface VoiceSampleFormInitial {
  id?: string;
  title?: string | null;
  bodyText?: string;
}

export interface VoiceSampleFormProps {
  open: boolean;
  onClose: () => void;
  initial?: VoiceSampleFormInitial;
}

export function VoiceSampleForm({
  open,
  onClose,
  initial,
}: VoiceSampleFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [bodyText, setBodyText] = useState(initial?.bodyText ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wordCount = useMemo(() => countVoiceSampleWords(bodyText), [bodyText]);
  const tooShort = wordCount < VOICE_SAMPLE_MIN_WORDS;

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

  if (!open) return null;
  const isEdit = Boolean(initial?.id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim() || null,
        bodyText,
      };
      const url = isEdit
        ? `/api/tiresias/agentic-os/autobiographer/voice-samples/${initial!.id}`
        : '/api/tiresias/agentic-os/autobiographer/voice-samples';
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
      setError(e.message ?? 'Failed to save sample');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-2xl bg-surface-2 border border-border-subtle rounded-xl p-5 space-y-4"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit voice sample' : 'New voice sample'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="block">
          <label
            htmlFor={fid('title')}
            className="text-xs uppercase tracking-wide text-text-secondary"
          >
            Title (optional)
          </label>
          <input
            id={fid('title')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
            placeholder="What does this sample capture?"
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
          />
        </div>

        <div className="block">
          <div className="flex items-baseline justify-between mb-1">
            <label
              htmlFor={fid('body-text')}
              className="text-xs uppercase tracking-wide text-text-secondary"
            >
              Sample text
            </label>
            <span
              className={`text-xs ${
                tooShort ? 'text-amber-300' : 'text-[#64748b]'
              }`}
            >
              {wordCount} words
              {tooShort && wordCount > 0 && (
                <> — under {VOICE_SAMPLE_MIN_WORDS} words is too thin</>
              )}
            </span>
          </div>
          <textarea
            id={fid('body-text')}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={14}
            maxLength={VOICE_SAMPLE_BODY_MAX}
            required
            placeholder="Paste a paragraph or page of your own writing — the more representative of your voice, the better the profile will be."
            className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white font-sans leading-relaxed focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded border border-border-subtle text-text-secondary hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || wordCount === 0}
            className="text-sm px-3 py-1.5 rounded bg-accent text-white font-medium hover:bg-[#3a52d8] disabled:opacity-50 transition"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save' : 'Create sample'}
          </button>
        </div>
      </form>
    </div>
  );
}
