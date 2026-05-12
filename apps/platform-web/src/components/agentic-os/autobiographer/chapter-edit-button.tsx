'use client';

/**
 * Autobiographer OS — ChapterEditButton.
 *
 * Lightweight modal trigger for opening the ChapterForm. Used in the
 * book detail page header (`New chapter`) and per-row (`Edit`).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { ChapterForm, type ChapterFormInitial } from './chapter-form';

interface Props {
  initial: ChapterFormInitial;
  label?: string;
  variant?: 'primary' | 'ghost';
}

export function ChapterEditButton({
  initial,
  label,
  variant = 'ghost',
}: Props) {
  const [open, setOpen] = useState(false);
  const isCreate = !initial.id;
  const Icon = isCreate ? Plus : Pencil;
  const computedLabel = label ?? (isCreate ? 'New chapter' : 'Edit');

  const baseCls =
    'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border transition';
  const primaryCls =
    'bg-[#4361EE] text-white border-[#4361EE] hover:bg-[#3a52d8]';
  const ghostCls =
    'bg-[#0f1117] text-[#cbd5e1] border-[#2a2d3e] hover:border-[#4361EE]/40';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${baseCls} ${variant === 'primary' ? primaryCls : ghostCls}`}
      >
        <Icon className="w-3.5 h-3.5" />
        {computedLabel}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <ChapterForm initial={initial} onClose={() => setOpen(false)} />
        </div>
      ) : null}
    </>
  );
}
