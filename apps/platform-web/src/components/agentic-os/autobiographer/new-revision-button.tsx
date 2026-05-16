'use client';

/**
 * Autobiographer OS — NewRevisionButton.
 *
 * Top-of-page CTA that creates a fresh user-authored revision seeded
 * with the active revision's body. Mirrors the rail's "New revision"
 * helper for sticky-header placement.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';

interface Props {
  chapterId: string;
  /** Body of the active revision (will be copied into the new revision). */
  seedBody: string;
}

export function NewRevisionButton({ chapterId, seedBody }: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/chapters/${chapterId}/revisions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            author: 'user',
            bodyText: seedBody,
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Create failed (${res.status}): ${text}`);
      }
      if (typeof window !== 'undefined') window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={working}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-60"
      >
        <Plus className="w-3.5 h-3.5" />
        {working ? 'Saving…' : 'New revision'}
      </button>
      {error ? (
        <span className="text-[11px] text-danger max-w-xs text-right">
          {error}
        </span>
      ) : null}
    </div>
  );
}
