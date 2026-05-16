'use client';

/**
 * Autobiographer OS — VoiceSampleToggle.
 *
 * Inline "Mark as voice sample" / "Unmark as voice sample" toggle that
 * lives on the memory detail page. When the memory already has a
 * backing sample, the button DELETEs it; otherwise it POSTs a new
 * sample carrying `memoryId` + the memory's body as `body_text`.
 *
 * Idempotent re-mark: if the row was deleted in another tab, clicking
 * mark again creates a fresh sample row with a new id rather than
 * 404ing.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic2, MicOff } from 'lucide-react';

export interface VoiceSampleToggleProps {
  memoryId: string;
  memoryTitle: string;
  memoryBody: string;
  /** Existing voice-sample id for this memory, when one exists. */
  existingSampleId: string | null;
}

export function VoiceSampleToggle({
  memoryId,
  memoryTitle,
  memoryBody,
  existingSampleId,
}: VoiceSampleToggleProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMarked = existingSampleId !== null;

  async function mark() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        '/api/tiresias/agentic-os/autobiographer/voice-samples',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            memoryId,
            title: memoryTitle,
            bodyText: memoryBody,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to mark as voice sample');
    } finally {
      setBusy(false);
    }
  }

  async function unmark() {
    if (!existingSampleId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/voice-samples/${existingSampleId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to unmark voice sample');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={isMarked ? unmark : mark}
        disabled={busy}
        className={`inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded border transition ${
          isMarked
            ? 'border-positive/30 bg-positive/10 text-positive hover:text-white hover:bg-positive/20'
            : 'border-border-subtle bg-surface-0 text-text-primary hover:text-white'
        } disabled:opacity-50`}
      >
        {isMarked ? (
          <>
            <MicOff className="w-3.5 h-3.5" />
            {busy ? 'Unmarking…' : 'Unmark as voice sample'}
          </>
        ) : (
          <>
            <Mic2 className="w-3.5 h-3.5" />
            {busy ? 'Marking…' : 'Mark as voice sample'}
          </>
        )}
      </button>
      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded px-2.5 py-1.5">
          {error}
        </div>
      )}
    </div>
  );
}
