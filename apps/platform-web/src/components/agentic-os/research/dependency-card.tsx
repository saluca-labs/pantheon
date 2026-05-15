'use client';

/**
 * Research OS Phase 6 — dependency edge card.
 *
 * Renders a single directed edge with peer experiment metadata, kind pill,
 * status toggle, and a delete button.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useState } from 'react';
import Link from 'next/link';
import { Trash2, ArrowRight, ArrowLeft } from 'lucide-react';
import { DependencyKindPill } from './dependency-kind-pill';
import { DependencyStatusToggle } from './dependency-status-toggle';
import type { ExperimentDependencyHydrated } from '@/lib/agentic-os/research/dependencies';

interface Props {
  edge: ExperimentDependencyHydrated;
  /**
   * Which side the peer represents from the current experiment's
   * perspective. 'upstream' = this depends on peer (peer is `to`).
   * 'downstream' = peer depends on this (peer is `from`).
   */
  direction: 'upstream' | 'downstream';
  onRemoved?: (id: string) => void;
}

export function DependencyCard({ edge, direction, onRemoved }: Props) {
  const [removed, setRemoved] = useState(false);

  async function handleDelete() {
    if (!confirm('Remove this dependency?')) return;
    const r = await fetch(`/api/tiresias/agentic-os/research/dependencies/${edge.id}`, {
      method: 'DELETE',
    });
    if (r.ok) {
      setRemoved(true);
      onRemoved?.(edge.id);
    }
  }

  if (removed) return null;

  const Arrow = direction === 'upstream' ? ArrowRight : ArrowLeft;
  return (
    <div
      className="rounded-lg border border-border-subtle bg-surface-2 p-3"
      data-testid={`dependency-card-${edge.id}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Arrow className="w-4 h-4 text-text-secondary" />
        <Link
          href={`/dashboard/os/research/experiments/${edge.peer.id}`}
          className="text-sm font-medium text-white hover:underline truncate flex-1 min-w-0"
        >
          {edge.peer.name}
        </Link>
        <DependencyKindPill kind={edge.kind} />
        <DependencyStatusToggle dependencyId={edge.id} status={edge.status} />
        <button
          type="button"
          onClick={handleDelete}
          className="rounded border border-danger/40 p-1 text-danger hover:bg-danger/10"
          title="Remove dependency"
          data-testid={`dependency-delete-${edge.id}`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {edge.notes && (
        <p className="mt-2 text-xs text-text-primary whitespace-pre-wrap">{edge.notes}</p>
      )}
    </div>
  );
}
