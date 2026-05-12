'use client';

/**
 * Autobiographer OS — VoiceSampleEditButton + VoiceSampleActions.
 *
 * `VoiceSampleEditButton` wraps the form in edit mode against an
 * existing sample row, plus a delete affordance.
 *
 * `VoiceSampleActions` is the standalone "Add sample" CTA the Voice
 * Studio header uses to open the form in create mode.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  VoiceSampleForm,
  type VoiceSampleFormInitial,
} from './voice-sample-form';

export interface VoiceSampleEditButtonProps {
  sample: VoiceSampleFormInitial & { id: string };
}

export function VoiceSampleEditButton({
  sample,
}: VoiceSampleEditButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!confirm('Delete this voice sample? This cannot be undone.')) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/voice-samples/${sample.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `${res.status} ${res.statusText}`);
        return;
      }
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs px-2 py-1 rounded border border-[#2a2d3e] bg-[#0f1117] text-[#cbd5e1] hover:text-white inline-flex items-center gap-1.5 transition"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="text-xs px-2 py-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:text-white hover:bg-rose-500/20 disabled:opacity-50 inline-flex items-center gap-1.5 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      <VoiceSampleForm
        open={open}
        onClose={() => setOpen(false)}
        initial={sample}
      />
    </>
  );
}

/** "Add sample" CTA wrapping the form in create mode. */
export function VoiceSampleActions({ label }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-[#4361EE] text-white font-medium hover:bg-[#3a52d8] transition"
      >
        <Plus className="w-4 h-4" />
        {label ?? 'Add sample'}
      </button>
      <VoiceSampleForm open={open} onClose={() => setOpen(false)} />
    </>
  );
}
