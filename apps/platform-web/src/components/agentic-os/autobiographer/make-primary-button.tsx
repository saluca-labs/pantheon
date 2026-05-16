'use client';

/**
 * Autobiographer OS — MakePrimaryButton.
 *
 * Single-action button that flips an arc to `is_primary = true`. Calls
 * the arc PATCH route with `{ isPrimary: true }`; the server clears the
 * bit on every sibling arc atomically.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';

export interface MakePrimaryButtonProps {
  arcId: string;
}

export function MakePrimaryButton({ arcId }: MakePrimaryButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function makePrimary() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/arcs/${arcId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ isPrimary: true }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      router.refresh();
    } catch (e: unknown) {
      const eErr = e instanceof Error ? e : new Error(String(e));
      setError(eErr.message ?? 'Failed to make primary');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={makePrimary}
        disabled={busy}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-1 rounded border border-border-subtle bg-surface-0 text-text-secondary hover:text-white hover:border-warning/40 disabled:opacity-50 transition"
        title="Make this arc the primary ordering for the book"
      >
        <Star className="w-3 h-3" />
        Make primary
      </button>
      {error && (
        <span className="text-[10px] text-danger ml-1" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
