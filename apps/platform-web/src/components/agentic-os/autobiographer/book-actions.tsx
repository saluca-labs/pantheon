'use client';

/**
 * Autobiographer OS — BookActions.
 *
 * Client wrapper around the "New book" CTA button. Owns the modal-open
 * state so the page can keep server-rendering.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { BookForm } from './book-form';

export function BookActions() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-accent text-white font-medium hover:bg-accent/90 transition"
      >
        <Plus className="w-4 h-4" />
        New book
      </button>
      <BookForm open={open} onClose={() => setOpen(false)} />
    </>
  );
}
