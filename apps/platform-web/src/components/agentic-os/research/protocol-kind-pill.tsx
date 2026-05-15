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
  method: 'border-os-research/40 text-os-research bg-os-research/10',
  sop: 'border-warning/40 text-warning bg-warning/10',
  analysis: 'border-accent/40 text-accent bg-accent/10',
  code_pipeline: 'border-positive/40 text-positive bg-positive/10',
  other: 'border-border-subtle text-text-secondary bg-surface-0',
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
