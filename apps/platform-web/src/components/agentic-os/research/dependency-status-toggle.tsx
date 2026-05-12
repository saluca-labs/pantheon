'use client';

/**
 * Research OS Phase 6 — dependency status toggle.
 *
 * Inline button that flips an edge between `open` and `cleared` via
 * PATCH. Used by the dependency card row.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useState } from 'react';
import type { DependencyStatus } from '@/lib/agentic-os/research/dependencies';

interface Props {
  dependencyId: string;
  status: DependencyStatus;
  onChanged?: (newStatus: DependencyStatus) => void;
}

export function DependencyStatusToggle({ dependencyId, status, onChanged }: Props) {
  const [current, setCurrent] = useState<DependencyStatus>(status);
  const [busy, setBusy] = useState(false);

  async function flip() {
    const next: DependencyStatus = current === 'open' ? 'cleared' : 'open';
    setBusy(true);
    try {
      const r = await fetch(`/api/tiresias/agentic-os/research/dependencies/${dependencyId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (r.ok) {
        setCurrent(next);
        onChanged?.(next);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={flip}
      disabled={busy}
      className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border transition disabled:opacity-50 ${
        current === 'open'
          ? 'border-amber-500/50 bg-amber-500/5 text-amber-300 hover:bg-amber-500/10'
          : 'border-emerald-500/50 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10'
      }`}
      data-testid={`dependency-status-toggle-${dependencyId}`}
    >
      {current === 'open' ? 'Open' : 'Cleared'}
    </button>
  );
}
