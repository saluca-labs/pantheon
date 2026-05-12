'use client';

/**
 * Research OS Phase 3 — Stand-alone archive button used on the list page
 * row affordance. The detail-page header has its own inline archive
 * action — this is the smaller variant for the ledger list.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import type { Hypothesis } from '@/lib/agentic-os/research/hypotheses';

interface Props {
  hypothesis: Hypothesis;
  onArchived?: (h: Hypothesis) => void;
  onRestored?: (h: Hypothesis) => void;
}

export function HypothesisArchiveButton({ hypothesis, onArchived, onRestored }: Props) {
  const [busy, setBusy] = useState(false);
  const isArchived = Boolean(hypothesis.archivedAt);

  async function handle() {
    setBusy(true);
    try {
      if (isArchived) {
        const res = await fetch(
          `/api/tiresias/agentic-os/research/hypotheses/${hypothesis.id}/restore`,
          { method: 'POST' },
        );
        if (res.ok) {
          const { hypothesis: restored } = await res.json();
          onRestored?.(restored);
        }
      } else {
        const res = await fetch(
          `/api/tiresias/agentic-os/research/hypotheses/${hypothesis.id}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ archived: true }),
          },
        );
        if (res.ok) {
          const { hypothesis: archived } = await res.json();
          onArchived?.(archived);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const Icon = isArchived ? ArchiveRestore : Archive;
  const label = isArchived ? 'Restore' : 'Archive';
  return (
    <button
      onClick={handle}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs text-[#94a3b8] hover:text-white disabled:opacity-50 transition"
      aria-label={`${label} hypothesis`}
    >
      <Icon className="w-3.5 h-3.5" />
      {busy ? '…' : label}
    </button>
  );
}
