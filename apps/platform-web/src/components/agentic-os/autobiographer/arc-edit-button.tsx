'use client';

/**
 * Autobiographer OS — ArcEditButton.
 *
 * Tiny client wrapper around `ArcForm` that opens the edit modal for an
 * existing arc. Used in the ArcCard's action row.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { ArcForm, type ArcFormInitial } from './arc-form';

export interface ArcEditButtonProps {
  arcId: string;
  initial: ArcFormInitial;
}

export function ArcEditButton({ arcId, initial }: ArcEditButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-1 rounded border border-border-subtle bg-surface-0 text-text-secondary hover:text-white transition"
        title="Edit arc"
      >
        <Pencil className="w-3 h-3" />
        Edit
      </button>
      <ArcForm
        open={open}
        onClose={() => setOpen(false)}
        arcId={arcId}
        initial={initial}
        allowDelete
      />
    </>
  );
}
