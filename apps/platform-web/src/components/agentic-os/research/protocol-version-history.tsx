'use client';

/**
 * Research OS Phase 5 — version history sidebar for a protocol.
 *
 * Reads `versions` (already-hydrated tree from GET /protocols/[id]) and
 * renders a list of row links — each version is its own row, so
 * deep-linking to old versions works.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import Link from 'next/link';
import { History } from 'lucide-react';
import type { Protocol } from '@/lib/agentic-os/research/protocols';

interface Props {
  protocol: Protocol;
  versions: Protocol[];
}

export function ProtocolVersionHistory({ protocol, versions }: Props) {
  return (
    <aside
      className="rounded-lg border border-border-subtle bg-surface-2 p-3"
      data-testid="protocol-version-history"
    >
      <div className="flex items-center gap-1.5 mb-2 text-xs uppercase tracking-wide text-text-secondary">
        <History className="w-3.5 h-3.5" />
        Version history
      </div>
      {versions.length === 0 ? (
        <p className="text-xs text-text-secondary italic">No versions.</p>
      ) : (
        <ol className="space-y-1.5">
          {versions.map((v) => {
            const isCurrent = v.id === protocol.id;
            return (
              <li key={v.id}>
                <Link
                  href={`/dashboard/os/research/protocols/${v.id}`}
                  className={`block px-2 py-1.5 rounded text-xs transition ${
                    isCurrent
                      ? 'bg-accent/20 border border-accent/40 text-white'
                      : 'border border-transparent hover:border-border-subtle hover:bg-surface-0 text-text-secondary'
                  }`}
                  data-testid={`protocol-version-history-row-${v.id}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium">v{v.version}</span>
                    <span className="text-[10px] opacity-70">
                      {v.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  {v.parentProtocolId == null && (
                    <span className="text-[9px] uppercase tracking-wide opacity-70">
                      root
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
