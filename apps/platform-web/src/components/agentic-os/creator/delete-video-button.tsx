'use client';

/**
 * Creator OS Phase 5 — Delete video button.
 *
 * Client component that deletes a video asset via the API and redirects to
 * the video list. Requires user confirmation before proceeding.
 *
 * @license MIT — Tiresias Creator OS Phase 5 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

interface DeleteVideoButtonProps {
  videoId: string;
}

export function DeleteVideoButton({ videoId }: DeleteVideoButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/creator/videos/${videoId}`,
        { method: 'DELETE' },
      );
      if (r.ok) {
        router.push('/dashboard/os/creator/videos');
        router.refresh();
      }
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
        >
          {deleting ? 'Deleting…' : 'Confirm Delete'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="px-3 py-1.5 rounded-lg border border-[#2a2d3e] text-[#94a3b8] text-xs font-medium hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/10 transition-colors"
    >
      <Trash2 className="w-3.5 h-3.5" />
      Delete
    </button>
  );
}
