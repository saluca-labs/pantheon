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
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-[#2a2d3e] bg-[#0f1117] text-[#cbd5e1] hover:border-[#4361EE]/40 transition"
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
