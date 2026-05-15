'use client';

/**
 * Research OS Phase 3 — Single linked-hypothesis row used on
 *   - the hypothesis detail page (linked experiments section)
 *   - the experiment detail page (hypotheses tab)
 *
 * Both contexts use the same shape: role pill + hypothesis title +
 * status pill + remove button. The "remove" wires to
 *   `DELETE /api/tiresias/.../experiments/:id/hypotheses/:hypothesisId`.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState } from 'react';
import Link from 'next/link';
import { X, ExternalLink } from 'lucide-react';
import {
  LINK_ROLE_LABELS,
  type LinkRole,
  type LinkedHypothesis,
} from '@/lib/agentic-os/research/experiment-hypotheses';

const ROLE_COLOR: Record<LinkRole, string> = {
  tests:     'text-positive bg-positive/10 border-positive/30',
  motivates: 'text-warning bg-warning/10 border-warning/30',
  related:   'text-accent bg-accent/10 border-accent/30',
};

interface Props {
  experimentId: string;
  linked: LinkedHypothesis;
  onUnlinked: (hypothesisId: string) => void;
  /** When true, the row links to the experiment instead of the hypothesis. */
  experimentView?: boolean;
  /** Cross-link href override (used when rendering from the hypothesis detail page to navigate to the experiment). */
  href?: string;
}

export function LinkedHypothesisRow({
  experimentId,
  linked,
  onUnlinked,
  experimentView,
  href,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = linked.link.role;

  async function handleUnlink() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/hypotheses/${linked.hypothesis.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Failed (${res.status})`);
        return;
      }
      onUnlinked(linked.hypothesis.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  const linkHref =
    href ??
    (experimentView
      ? `/dashboard/os/research/experiments/${experimentId}`
      : `/dashboard/os/research/hypotheses/${linked.hypothesis.id}`);

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-0/60 p-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span
          className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${ROLE_COLOR[role]}`}
        >
          {LINK_ROLE_LABELS[role]}
        </span>
        <Link
          href={linkHref}
          className="text-sm text-white hover:text-accent inline-flex items-center gap-1 min-w-0"
        >
          <span className="truncate">{linked.hypothesis.title}</span>
          <ExternalLink className="w-3 h-3 shrink-0" />
        </Link>
        {linked.link.notes && (
          <span className="text-xs text-text-secondary italic">{linked.link.notes}</span>
        )}
      </div>
      <button
        onClick={handleUnlink}
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-danger disabled:opacity-50 transition"
        aria-label="Unlink hypothesis"
      >
        <X className="w-3 h-3" />
        {busy ? '…' : 'Unlink'}
      </button>
      {error && (
        <p className="w-full text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
