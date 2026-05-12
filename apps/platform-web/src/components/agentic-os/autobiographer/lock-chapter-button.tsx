'use client';

/**
 * Autobiographer OS — LockChapterButton.
 *
 * POSTs to `/chapters/[id]/lock`. On 200 → refreshes the route. On 400
 * with a `lock_blocked` body → opens the shortfall modal. On 401 →
 * redirects to login. Any other failure surfaces inline.
 *
 * Locked chapters render an Unlock button (passes `?unlock=true` to the
 * same endpoint).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Unlock } from 'lucide-react';
import {
  LockShortfallModal,
  type LockShortfallEntry,
} from './lock-shortfall-modal';

export interface LockChapterButtonProps {
  chapterId: string;
  bookId: string;
  locked: boolean;
}

export function LockChapterButton({
  chapterId,
  bookId,
  locked,
}: LockChapterButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    open: boolean;
    required: string[];
    missing: LockShortfallEntry[];
    hasSensitiveContent: boolean;
  }>({
    open: false,
    required: [],
    missing: [],
    hasSensitiveContent: false,
  });

  async function attempt(unlock: boolean) {
    setBusy(true);
    setError(null);
    try {
      const url = unlock
        ? `/api/tiresias/agentic-os/autobiographer/chapters/${chapterId}/lock?unlock=true`
        : `/api/tiresias/agentic-os/autobiographer/chapters/${chapterId}/lock`;
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 400 && data.error === 'lock_blocked') {
        setModal({
          open: true,
          required: Array.isArray(data.required) ? data.required : [],
          missing: Array.isArray(data.missing) ? data.missing : [],
          hasSensitiveContent: Boolean(data.hasSensitiveContent),
        });
        return;
      }
      throw new Error(data.error ?? `${res.status} ${res.statusText}`);
    } catch (e: any) {
      setError(e.message ?? 'Failed to update lock state');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {locked ? (
        <button
          type="button"
          onClick={() => void attempt(true)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-50"
        >
          <Unlock className="w-3.5 h-3.5" />
          Unlock chapter
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void attempt(false)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50"
        >
          <Lock className="w-3.5 h-3.5" />
          Lock chapter
        </button>
      )}
      {error && (
        <span className="text-xs text-red-400 ml-2">{error}</span>
      )}
      <LockShortfallModal
        open={modal.open}
        bookId={bookId}
        required={modal.required}
        missing={modal.missing}
        hasSensitiveContent={modal.hasSensitiveContent}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
    </>
  );
}
