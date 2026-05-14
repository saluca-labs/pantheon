'use client';

/**
 * Autobiographer OS — VoiceBuildProfileButton.
 *
 * The CTA the Voice Studio uses to fire the two-stage builder. POSTs to
 * `/voice-profiles` with no body (the server reads the caller's
 * non-archived samples). Refreshes the page so the new profile row
 * shows up in the list.
 *
 * Disabled when there are no active samples — the server would 400 in
 * that case but disabling the button keeps the UI honest.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';

export interface VoiceBuildProfileButtonProps {
  /** Number of active (non-archived) samples available to the builder. */
  activeSampleCount: number;
  /** When true, the newly built profile is immediately marked active. */
  setActive?: boolean;
}

export function VoiceBuildProfileButton({
  activeSampleCount,
  setActive,
}: VoiceBuildProfileButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = activeSampleCount === 0 || busy;

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        '/api/tiresias/agentic-os/autobiographer/voice-profiles',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            setActive: setActive ?? true,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.message ?? data.error ?? `${res.status} ${res.statusText}`,
        );
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to build profile');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={build}
        disabled={disabled}
        className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-accent text-white font-medium hover:bg-[#3a52d8] disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        <Sparkles className="w-4 h-4" />
        {busy
          ? 'Building…'
          : activeSampleCount === 0
            ? 'Add a sample first'
            : `Build profile from ${activeSampleCount} ${
                activeSampleCount === 1 ? 'sample' : 'samples'
              }`}
      </button>
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2.5 py-1.5">
          {error}
        </div>
      )}
    </div>
  );
}
