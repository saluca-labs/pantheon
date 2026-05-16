'use client';

/**
 * Autobiographer OS — ArcChapterAttachButton.
 *
 * Dropdown chooser that lists every chapter in the book NOT yet in the
 * arc and attaches one with a single POST. Cross-book chapters are
 * pre-filtered server-side; the route layer rejects mismatches as 404.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

export interface AttachableChapter {
  id: string;
  title: string | null;
  position: number;
}

export interface ArcChapterAttachButtonProps {
  arcId: string;
  attachable: AttachableChapter[];
}

export function ArcChapterAttachButton({
  arcId,
  attachable,
}: ArcChapterAttachButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attach(chapterId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/arcs/${arcId}/chapters`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chapter_id: chapterId }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      setOpen(false);
      router.refresh();
    } catch (e: unknown) {
      const eErr = e instanceof Error ? e : new Error(String(e));
      setError(eErr.message ?? 'Failed to attach chapter');
    } finally {
      setBusy(false);
    }
  }

  if (attachable.length === 0) {
    return (
      <p className="text-[10px] text-text-tertiary italic px-1">
        Every chapter in this book is already in the arc.
      </p>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border-subtle bg-surface-0 text-text-primary hover:text-white transition"
      >
        <Plus className="w-3.5 h-3.5" />
        Attach chapter
      </button>
      {open && (
        <ul className="absolute z-10 mt-1 w-72 max-h-64 overflow-y-auto rounded border border-border-subtle bg-surface-0 shadow-lg">
          {attachable.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => attach(c.id)}
                disabled={busy}
                className="w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 hover:bg-surface-2 text-text-primary"
              >
                <span className="truncate">
                  {c.title ?? 'Untitled chapter'}
                </span>
                <span className="text-[10px] text-text-tertiary">
                  pos {c.position}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <span className="text-[10px] text-danger ml-2" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
