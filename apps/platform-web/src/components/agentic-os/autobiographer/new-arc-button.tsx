'use client';

/**
 * Autobiographer OS — NewArcButton.
 *
 * Small client button that opens an ArcForm in create mode for the
 * given book.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ArcForm } from './arc-form';

export interface NewArcButtonProps {
  bookId: string;
}

export function NewArcButton({ bookId }: NewArcButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-border-subtle bg-surface-0 text-text-primary hover:border-accent/40 transition"
      >
        <Plus className="w-3.5 h-3.5" />
        New arc
      </button>
      <ArcForm
        open={open}
        onClose={() => setOpen(false)}
        bookId={bookId}
      />
    </>
  );
}
