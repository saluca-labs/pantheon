'use client';

/**
 * Autobiographer OS — MemoryActions.
 *
 * Client wrapper around the "New memory" CTA button. Optionally locks the
 * memory to a specific book when invoked from the per-book detail page.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { MemoryForm, type BookOption } from './memory-form';

export interface MemoryActionsProps {
  books: BookOption[];
  lockedBookId?: string | null;
  label?: string;
}

export function MemoryActions({
  books,
  lockedBookId,
  label,
}: MemoryActionsProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-[#4361EE] text-white font-medium hover:bg-[#3a52d8] transition"
      >
        <Plus className="w-4 h-4" />
        {label ?? 'Capture memory'}
      </button>
      <MemoryForm
        open={open}
        onClose={() => setOpen(false)}
        books={books}
        lockedBookId={lockedBookId ?? null}
      />
    </>
  );
}
