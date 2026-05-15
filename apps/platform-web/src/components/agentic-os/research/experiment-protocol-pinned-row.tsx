'use client';

/**
 * Research OS Phase 5 — pinned protocol row on the experiment Protocols tab.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, X } from 'lucide-react';
import type { LinkedProtocolPin } from '@/lib/agentic-os/research/experiment-protocols';
import { ProtocolKindPill } from './protocol-kind-pill';
import { Spinner } from '@/components/agentic-os/_shared/views';

interface Props {
  experimentId: string;
  pin: LinkedProtocolPin;
}

export function ExperimentProtocolPinnedRow({ experimentId, pin }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function onUnpin() {
    if (!confirm(`Unpin "${pin.protocol.title}" from this experiment?`)) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/protocols/${pin.protocol.id}`,
        { method: 'DELETE' },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const resolvedExact = pin.resolved.version === pin.link.pinnedVersion;

  return (
    <div
      className="rounded-lg border border-border-subtle bg-surface-2 p-4 space-y-2"
      data-testid={`experiment-protocol-pinned-${pin.link.id}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Link
              href={`/dashboard/os/research/protocols/${pin.resolved.id}`}
              className="text-sm font-semibold text-white hover:underline truncate"
            >
              {pin.protocol.title}
            </Link>
            <ProtocolKindPill kind={pin.resolved.kind} />
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
              Pinned v{pin.link.pinnedVersion}
            </span>
            {!resolvedExact && (
              <span
                className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/10"
                title="pinned_version not found in this protocol's tree — showing root content"
              >
                fallback → root
              </span>
            )}
          </div>
          {pin.link.notes && (
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{pin.link.notes}</p>
          )}
          <Link
            href={`/dashboard/os/research/protocols/${pin.resolved.id}`}
            className="inline-flex items-center gap-1 mt-1 text-xs text-accent hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Open protocol
          </Link>
        </div>
        <button
          type="button"
          onClick={onUnpin}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 disabled:opacity-50"
          data-testid={`experiment-protocol-pinned-unpin-${pin.link.id}`}
        >
          {busy ? <Spinner size="xs" /> : <X className="w-3 h-3" />}
          Unpin
        </button>
      </div>
      {err && <p className="text-xs text-rose-400">{err}</p>}
    </div>
  );
}
