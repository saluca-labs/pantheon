'use client';

/**
 * Research OS Phase 6 — dependency add form.
 *
 * Pick a peer experiment from the user's other experiments + optional
 * kind + notes. POSTs to the experiment-scoped dependencies route.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useState } from 'react';
import {
  DEPENDENCY_KIND_VALUES,
  DEPENDENCY_KIND_LABELS,
  type DependencyKind,
  type ExperimentDependency,
} from '@/lib/agentic-os/research/dependencies';

export interface PeerExperimentOption {
  id: string;
  name: string;
}

interface Props {
  experimentId: string;
  peerOptions: PeerExperimentOption[];
  onCreated?: (dep: ExperimentDependency) => void;
  onCancel?: () => void;
}

export function DependencyForm({
  experimentId,
  peerOptions,
  onCreated,
  onCancel,
}: Props) {
  const [toExperimentId, setToExperimentId] = useState<string>(
    peerOptions[0]?.id ?? '',
  );
  const [kind, setKind] = useState<DependencyKind>('feeds');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/dependencies`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            toExperimentId,
            kind,
            notes: notes || null,
          }),
        },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error ?? `Failed (${r.status})`);
        return;
      }
      const { dependency } = await r.json();
      onCreated?.(dependency);
      setNotes('');
    } catch (err: any) {
      setError(err?.message ?? 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  if (peerOptions.length === 0) {
    return (
      <p className="text-xs text-text-secondary italic">
        No other experiments to link.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-lg border border-border-subtle bg-surface-2 p-3"
      data-testid="dependency-form"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-text-secondary">
            Peer experiment
          </label>
          <select
            value={toExperimentId}
            onChange={(e) => setToExperimentId(e.target.value)}
            required
            className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-sm text-white"
          >
            {peerOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-text-secondary">Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DependencyKind)}
            className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-sm text-white"
          >
            {DEPENDENCY_KIND_VALUES.map((k) => (
              <option key={k} value={k}>
                {DEPENDENCY_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-text-secondary">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={4000}
          className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-sm text-white"
        />
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || !toExperimentId}
          className="rounded bg-accent text-white text-sm font-medium px-3 py-1 disabled:opacity-50"
        >
          {submitting ? 'Linking…' : 'Add dependency'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border-subtle text-text-secondary hover:text-white text-sm px-3 py-1"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
