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
  feeds: 'border-sky-500/50 bg-sky-500/5 text-sky-300',
  blocks: 'border-red-500/50 bg-red-500/5 text-red-300',
  informs: 'border-border-subtle bg-surface-0 text-text-secondary',
  replicates: 'border-emerald-500/50 bg-emerald-500/5 text-emerald-300',
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
