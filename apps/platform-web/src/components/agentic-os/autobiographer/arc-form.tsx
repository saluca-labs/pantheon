'use client';

/**
 * Autobiographer OS — ArcForm.
 *
 * Modal form that creates / edits an arc. When `arcId` is omitted it
 * POSTs to `/books/[id]/arcs`; when set it PATCHes the existing arc.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Trash2, X } from 'lucide-react';
import {
  ARC_KINDS,
  ARC_KIND_LABELS,
  type ArcKind,
} from '@/lib/agentic-os/autobiographer/arcs';

export interface ArcFormInitial {
  title?: string;
  kind?: ArcKind;
  description?: string | null;
  isPrimary?: boolean;
}

export interface ArcFormProps {
  open: boolean;
  onClose: () => void;
  /** When provided we PATCH; otherwise we POST. */
  arcId?: string;
  /** Required for create flow. */
  bookId?: string;
  initial?: ArcFormInitial;
  /** Show delete button (only true on edit). */
  allowDelete?: boolean;
}

export function ArcForm({
  open,
  onClose,
  arcId,
  bookId,
  initial,
  allowDelete,
}: ArcFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [kind, setKind] = useState<ArcKind>(initial?.kind ?? 'chronological');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isPrimary, setIsPrimary] = useState<boolean>(
    Boolean(initial?.isPrimary),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        kind,
      };
      if (description.trim()) body.description = description.trim();
      else if (arcId) body.description = null;
      // is_primary is included only when toggled on (the API treats
      // omitted as "leave unchanged"; sending false clears the flag).
      if (arcId) body.isPrimary = isPrimary;
      else if (isPrimary) body.isPrimary = true;

      const url = arcId
        ? `/api/tiresias/agentic-os/autobiographer/arcs/${arcId}`
        : `/api/tiresias/agentic-os/autobiographer/books/${bookId}/arcs`;
      const res = await fetch(url, {
        method: arcId ? 'PATCH' : 'POST',
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
      setError(e.message ?? 'Failed to save arc');
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!arcId) return;
    if (typeof window !== 'undefined' &&
        !window.confirm('Delete this arc? Chapters are not deleted.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/arcs/${arcId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      onClose();
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to delete arc');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface-2 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm uppercase tracking-wide text-text-secondary">
            {arcId ? 'Edit arc' : 'New arc'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2 mb-3">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-text-secondary">
              Title
            </span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-text-secondary">
              Kind
            </span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ArcKind)}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            >
              {ARC_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ARC_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-text-secondary">
              Description (optional)
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={4000}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="accent-amber-500"
            />
            Use as primary arc for this book
          </label>

          <div className="flex justify-end gap-2 pt-2">
            {allowDelete && (
              <button
                type="button"
                onClick={destroy}
                disabled={busy}
                className="text-xs px-3 py-1.5 rounded border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50 transition inline-flex items-center gap-1 mr-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete arc
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded border border-border-subtle text-text-secondary hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || title.trim().length === 0}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-[#3a52d8] disabled:opacity-50 transition"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
