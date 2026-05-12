'use client';

/**
 * Research OS Phase 5 — protocol card (used on the library list).
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import Link from 'next/link';
import { FileText } from 'lucide-react';
import type { Protocol } from '@/lib/agentic-os/research/protocols';
import { ProtocolKindPill } from './protocol-kind-pill';

interface Props {
  protocol: Protocol;
}

export function ProtocolCard({ protocol }: Props) {
  return (
    <Link
      href={`/dashboard/os/research/protocols/${protocol.id}`}
      className="block rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/40 transition"
      data-testid={`protocol-card-${protocol.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <FileText className="w-4 h-4 text-[#4361EE]" />
            <h3 className="text-sm font-semibold text-white truncate">{protocol.title}</h3>
            <ProtocolKindPill kind={protocol.kind} />
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-[#2a2d3e] text-[#94a3b8] bg-[#0f1117]">
              v{protocol.version}
            </span>
          </div>
          {protocol.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {protocol.tags.slice(0, 8).map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {protocol.bodyMd && (
            <p className="mt-2 text-xs text-[#94a3b8] line-clamp-2">
              {protocol.bodyMd.replace(/[`*_#>]+/g, '').slice(0, 200)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
