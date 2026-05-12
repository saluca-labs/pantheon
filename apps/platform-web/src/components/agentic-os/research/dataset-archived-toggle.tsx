'use client';

/**
 * Research OS Phase 5 — dataset archived toggle.
 *
 * PATCH /datasets/:id with `{ archived: true|false }`. The `archived`
 * flag is a SEMANTIC marker (was the raw data archived externally —
 * Zenodo, institutional repo, etc.) — NOT a soft-delete.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react';

interface Props {
  datasetId: string;
  archived: boolean;
}

export function DatasetArchivedToggle({ datasetId, archived }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function onClick() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/tiresias/agentic-os/research/datasets/${datasetId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: !archived }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-white transition disabled:opacity-50"
      data-testid={`dataset-archived-toggle-${datasetId}`}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : archived ? (
        <ArchiveRestore className="w-3.5 h-3.5" />
      ) : (
        <Archive className="w-3.5 h-3.5" />
      )}
      {archived ? 'Mark active' : 'Mark archived'}
      {err && <span className="text-rose-400 ml-1">({err})</span>}
    </button>
  );
}
