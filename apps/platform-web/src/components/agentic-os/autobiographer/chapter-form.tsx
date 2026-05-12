'use client';

/**
 * Autobiographer OS — ChapterForm.
 *
 * Modal form for creating or editing a chapter's metadata (title,
 * slug, status, summary, target word count). The body prose lives in
 * a separate revision editor — this form never touches `body_text`.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { useState } from 'react';
import {
  CHAPTER_STATUSES,
  CHAPTER_STATUS_LABELS,
  CHAPTER_SLUG_MAX,
  CHAPTER_SUMMARY_MAX,
  CHAPTER_TITLE_MAX,
  type ChapterStatus,
} from '@/lib/agentic-os/autobiographer/chapters';

export interface ChapterFormInitial {
  id?: string | null;
  bookId: string;
  title?: string | null;
  slug?: string | null;
  status?: ChapterStatus;
  summary?: string | null;
  targetWordCount?: number | null;
}

interface Props {
  initial: ChapterFormInitial;
  onClose: () => void;
}

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block text-[10px] text-[#64748b] mt-1">{hint}</span>
      ) : null}
    </label>
  );
}

export function ChapterForm({ initial, onClose }: Props) {
  const isEdit = Boolean(initial.id);
  const [title, setTitle] = useState(initial.title ?? '');
  const [slug, setSlug] = useState(initial.slug ?? '');
  const [status, setStatus] = useState<ChapterStatus>(
    initial.status ?? 'outline',
  );
  const [summary, setSummary] = useState(initial.summary ?? '');
  const [targetWords, setTargetWords] = useState(
    initial.targetWordCount == null ? '' : String(initial.targetWordCount),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        status,
      };
      if (title.trim()) body.title = title.trim();
      if (slug.trim()) body.slug = slug.trim();
      if (summary.trim()) body.summary = summary.trim();
      if (targetWords.trim()) {
        const n = Number(targetWords);
        if (Number.isInteger(n) && n >= 0) body.targetWordCount = n;
      }
      const res = isEdit
        ? await fetch(
            `/api/tiresias/agentic-os/autobiographer/chapters/${initial.id}`,
            {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            },
          )
        : await fetch(
            `/api/tiresias/agentic-os/autobiographer/books/${initial.bookId}/chapters`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            },
          );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Save failed (${res.status}): ${text || res.statusText}`);
      }
      onClose();
      // Reload page to pick up server state. The page is `force-dynamic`
      // so a hard refresh round-trips through the route.
      if (typeof window !== 'undefined') window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-xl space-y-4 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5"
    >
      <h2 className="text-base font-semibold text-white">
        {isEdit ? 'Edit chapter' : 'New chapter'}
      </h2>

      <Field label="Title">
        <input
          type="text"
          maxLength={CHAPTER_TITLE_MAX}
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. The summer we moved to Albuquerque"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Slug" hint="kebab-case; auto-derived from title if blank">
          <input
            type="text"
            maxLength={CHAPTER_SLUG_MAX}
            className={`${inputCls} font-mono`}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            pattern="[a-z0-9-]+"
            placeholder="summer-abq"
          />
        </Field>
        <Field label="Status">
          <select
            className={inputCls}
            value={status}
            onChange={(e) => setStatus(e.target.value as ChapterStatus)}
          >
            {CHAPTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CHAPTER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Summary"
        hint="Short preview used in the chapter list + PDF export."
      >
        <textarea
          className={`${inputCls} min-h-[80px]`}
          maxLength={CHAPTER_SUMMARY_MAX}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One or two sentences about what this chapter covers."
        />
      </Field>

      <Field label="Target word count" hint="Optional sizing goal.">
        <input
          type="number"
          min={0}
          step={100}
          className={inputCls}
          value={targetWords}
          onChange={(e) => setTargetWords(e.target.value)}
          placeholder="e.g. 2500"
        />
      </Field>

      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : null}

      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded border border-[#2a2d3e] bg-[#0f1117] text-[#cbd5e1] hover:border-[#4361EE]/40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="text-xs px-3 py-1.5 rounded bg-[#4361EE] text-white hover:bg-[#3a52d8] disabled:opacity-60"
        >
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create chapter'}
        </button>
      </div>
    </form>
  );
}
