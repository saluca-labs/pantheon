'use client';

/**
 * Autobiographer OS — BookForm.
 *
 * Create-and-edit modal for a book. Phase 1 only wires the create flow
 * from the hub page. Edit flows in Phase 4 will reuse this same shape.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import {
  BOOK_STATUSES,
  BOOK_STATUS_LABELS,
  type BookStatus,
} from '@/lib/agentic-os/autobiographer/books';

export interface BookFormInitial {
  id?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  status?: BookStatus;
  targetCompletionDate?: string;
  targetAudience?: string;
  tags?: string[];
  coverImageUrl?: string;
}

export interface BookFormProps {
  open: boolean;
  onClose: () => void;
  initial?: BookFormInitial;
}

export function BookForm({ open, onClose, initial }: BookFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<BookStatus>(
    initial?.status ?? 'drafting',
  );
  const [targetCompletionDate, setTargetCompletionDate] = useState(
    initial?.targetCompletionDate ?? '',
  );
  const [targetAudience, setTargetAudience] = useState(
    initial?.targetAudience ?? '',
  );
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(', '));
  const [coverImageUrl, setCoverImageUrl] = useState(
    initial?.coverImageUrl ?? '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isEdit = Boolean(initial?.id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        description: description.trim() || null,
        status,
        targetCompletionDate: targetCompletionDate || null,
        targetAudience: targetAudience.trim() || null,
        tags,
        coverImageUrl: coverImageUrl.trim() || null,
      };
      const url = isEdit
        ? `/api/tiresias/agentic-os/autobiographer/books/${initial!.id}`
        : '/api/tiresias/agentic-os/autobiographer/books';
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
      setError(e.message ?? 'Failed to save book');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit book' : 'New book'}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
        className="relative w-full max-w-xl bg-surface-2 rounded-xl border border-border-subtle p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit book' : 'New book'}
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
            placeholder="Title of your book"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Subtitle
          </span>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            maxLength={500}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="Optional subtitle"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            rows={3}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="What is this book about?"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BookStatus)}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            >
              {BOOK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {BOOK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Target completion
            </span>
            <input
              type="date"
              value={targetCompletionDate}
              onChange={(e) => setTargetCompletionDate(e.target.value)}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Target audience
          </span>
          <input
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            maxLength={500}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder='e.g. "family", "general public", "executive auto-bio for board members"'
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Tags (comma-separated)
          </span>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="memoir, family-history, childhood"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Cover image URL
          </span>
          <input
            type="url"
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            maxLength={2000}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="https://..."
          />
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
            disabled={submitting || !title.trim()}
            className="text-sm px-4 py-1.5 rounded bg-accent text-white font-medium disabled:opacity-50 hover:bg-accent/90 transition"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save' : 'Create book'}
          </button>
        </div>
      </form>
    </div>
  );
}
