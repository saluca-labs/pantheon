'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import type { JournalPrompt } from '@/lib/agentic-os/health/repo';

interface Props {
  /** Optional prompt seeding the body; when set, shown above the editor. */
  prompt?: JournalPrompt | null;
  /** When set, this is an edit of an existing entry. */
  editingId?: string;
  initial?: {
    title?: string | null;
    body?: string;
    promptId?: string | null;
  };
}

export function JournalEditor({ prompt, editingId, initial }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState<string>(initial?.title ?? '');
  const [body, setBody] = useState<string>(initial?.body ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const bodyId = useId();

  async function onSubmit() {
    if (body.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title: title || null,
        body,
        promptId: editingId
          ? (initial?.promptId ?? null)
          : (prompt?.id ?? null),
      };
      const url = editingId
        ? `/api/tiresias/agentic-os/health/journal/${editingId}`
        : '/api/tiresias/agentic-os/health/journal';
      const method = editingId ? 'PATCH' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Save failed');
      const id = data.entry?.id ?? editingId;
      router.push(`/dashboard/os/health/journal/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!editingId) return;
    if (!confirm('Delete this journal entry? This cannot be undone.')) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/health/journal/${editingId}`,
        { method: 'DELETE' },
      );
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error ?? 'Delete failed');
      }
      router.push('/dashboard/os/health/journal');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {prompt && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
          <div className="text-[10px] uppercase tracking-wide text-accent mb-1">
            {prompt.category.replace(/-/g, ' ')}
          </div>
          <p className="text-sm text-white leading-relaxed">{prompt.prompt}</p>
          {prompt.source && (
            <p className="text-[10px] text-text-secondary/70 mt-2">
              Source: {prompt.source}
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor={titleId} className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
          Title (optional)
        </label>
        <input
          id={titleId}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A line that captures the gist"
          className="w-full rounded-lg border border-border-subtle bg-surface-0 text-sm text-white placeholder:text-text-secondary px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor={bodyId} className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
          Entry
        </label>
        <textarea
          id={bodyId}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          placeholder="Write freely. The screen is yours."
          className="w-full rounded-lg border border-border-subtle bg-surface-0 text-sm text-white placeholder:text-text-secondary px-3 py-2 leading-relaxed resize-y"
        />
        <p className="text-[10px] text-text-secondary/70 mt-1">
          Free-text entries are scanned for crisis language so the safety
          resources can surface — they are never blocked or deleted.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={submitting || body.trim().length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition"
        >
          <Save className="w-4 h-4" />
          {submitting
            ? 'Saving…'
            : editingId
              ? 'Save changes'
              : 'Save entry'}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={submitting}
            className="rounded-lg border border-danger/30 bg-danger/5 hover:bg-danger/10 disabled:opacity-60 text-danger text-xs px-3 py-2 transition"
          >
            Delete
          </button>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}
