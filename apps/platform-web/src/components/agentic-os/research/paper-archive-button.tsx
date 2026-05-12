'use client';

/**
 * Research OS Phase 4 — paper archive / restore inline button.
 *
 * Used on the paper-detail header. Renders an "Archive" affordance
 * when the paper is active, and a "Restore" affordance when it's
 * archived. Confirms before firing the DELETE / restore POST.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, RotateCcw } from 'lucide-react';
import type { Paper } from '@/lib/agentic-os/research/papers';

interface Props {
  paper: Paper;
  onChanged?: (paper: Paper) => void;
}

export function PaperArchiveButton({ paper, onChanged }: Props) {
  const router = useRouter();
  const isArchived = paper.archivedAt != null;
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAction() {
    setSubmitting(true);
    setError(null);
    try {
      let res: Response;
      if (isArchived) {
        res = await fetch(
          `/api/tiresias/agentic-os/research/papers/${paper.id}/restore`,
          { method: 'POST' },
        );
      } else {
        res = await fetch(
          `/api/tiresias/agentic-os/research/papers/${paper.id}`,
          { method: 'DELETE' },
        );
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        setError(
          detail && typeof detail.error === 'string'
            ? detail.error
            : `Request failed (${res.status})`,
        );
        return;
      }
      const data = await res.json();
      onChanged?.(data.paper ?? paper);
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition ${
          isArchived
            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            : 'border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8] hover:text-rose-300 hover:border-rose-500/40'
        }`}
        data-testid={`paper-archive-${isArchived ? 'restore' : 'archive'}-${paper.id}`}
      >
        {isArchived ? (
          <>
            <RotateCcw className="w-3.5 h-3.5" />
            Restore
          </>
        ) : (
          <>
            <Archive className="w-3.5 h-3.5" />
            Archive
          </>
        )}
      </button>
    );
  }
  return (
    <div className="inline-flex items-center gap-2" data-testid="paper-archive-confirm">
      <span className="text-xs text-[#94a3b8]">
        {isArchived ? 'Restore this paper?' : 'Archive this paper?'}
      </span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={submitting}
        className="text-xs text-[#94a3b8] hover:text-white"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleAction}
        disabled={submitting}
        className={`text-xs px-2 py-1 rounded border ${
          isArchived
            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
            : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
        }`}
        data-testid="paper-archive-confirm-yes"
      >
        {submitting ? '…' : isArchived ? 'Restore' : 'Archive'}
      </button>
      {error && (
        <span className="text-xs text-rose-300 ml-2" data-testid="paper-archive-error">
          {error}
        </span>
      )}
    </div>
  );
}
