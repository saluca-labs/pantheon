'use client';

/**
 * Research OS Phase 5 — protocol kind pill.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import {
  PROTOCOL_KIND_LABELS,
  type ProtocolKind,
} from '@/lib/agentic-os/research/protocol-kinds';

const COLOR: Record<ProtocolKind, string> = {
  method: 'border-sky-500/40 text-sky-300 bg-sky-500/10',
  sop: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
  analysis: 'border-violet-500/40 text-violet-300 bg-violet-500/10',
  code_pipeline: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  other: 'border-[#2a2d3e] text-[#94a3b8] bg-[#0f1117]',
};

export function ProtocolKindPill({ kind }: { kind: ProtocolKind }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${COLOR[kind]}`}
      data-testid={`protocol-kind-pill-${kind}`}
    >
      {PROTOCOL_KIND_LABELS[kind]}
    </span>
  );
}
