/**
 * Research OS Phase 6 — dependency kind pill.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import {
  DEPENDENCY_KIND_LABELS,
  type DependencyKind,
} from '@/lib/agentic-os/research/dependencies';

const KIND_STYLE: Record<DependencyKind, string> = {
  feeds: 'border-os-research/50 bg-os-research/5 text-os-research',
  blocks: 'border-danger/50 bg-danger/5 text-danger',
  informs: 'border-border-subtle bg-surface-0 text-text-secondary',
  replicates: 'border-positive/50 bg-positive/5 text-positive',
};

interface Props {
  kind: DependencyKind;
}

export function DependencyKindPill({ kind }: Props) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${KIND_STYLE[kind]}`}
      data-testid={`dependency-kind-pill-${kind}`}
    >
      {DEPENDENCY_KIND_LABELS[kind]}
    </span>
  );
}
