'use client';

/**
 * Autobiographer OS — MemoryEditButton.
 *
 * Client wrapper that opens the MemoryForm in edit mode against an
 * existing memory row. Used on the memory detail page.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import {
  MemoryForm,
  type BookOption,
  type MemoryFormInitial,
} from './memory-form';

export interface MemoryEditButtonProps {
  memory: MemoryFormInitial & { id: string };
  books: BookOption[];
}

export function MemoryEditButton({ memory, books }: MemoryEditButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (
      !confirm(
        'Delete this memory permanently? This cannot be undone — memories are precious, so you may want to detach from the book instead.',
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/memories/${memory.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `${res.status} ${res.statusText}`);
        return;
      }
      router.push('/dashboard/os/autobiographer/memories');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded border border-border-subtle bg-surface-0 text-text-primary hover:text-white transition"
        >
          <Pencil className="w-4 h-4" />
          Edit
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded border border-danger/30 bg-danger/10 text-danger hover:text-white hover:bg-danger/20 disabled:opacity-50 transition"
        >
          <Trash2 className="w-4 h-4" />
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      <MemoryForm
        open={open}
        onClose={() => setOpen(false)}
        initial={memory}
        books={books}
      />
    </>
  );
}
