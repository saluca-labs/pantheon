'use client';

/**
 * Research OS Phase 6 — full dependencies tab.
 *
 * Renders the upstream + downstream lists side-by-side with an inline
 * add form. Hydrates with a server-fetched snapshot; refreshes after
 * mutate calls.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useState, useCallback, useEffect } from 'react';
import { Plus, ArrowRight, ArrowLeft } from 'lucide-react';
import { DependencyCard } from './dependency-card';
import {
  DependencyForm,
  type PeerExperimentOption,
} from './dependency-form';
import type {
  ExperimentDependenciesView,
  ExperimentDependencyHydrated,
} from '@/lib/agentic-os/research/dependencies';

interface Props {
  experimentId: string;
  initialView: ExperimentDependenciesView;
  peerOptions: PeerExperimentOption[];
}

export function DependencyList({ experimentId, initialView, peerOptions }: Props) {
  const [view, setView] = useState(initialView);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(async () => {
    const r = await fetch(
      `/api/tiresias/agentic-os/research/experiments/${experimentId}/dependencies`,
    );
    if (r.ok) {
      const next = await r.json();
      setView(next);
    }
  }, [experimentId]);

  function handleRemoved(id: string) {
    setView((prev) => ({
      upstream: prev.upstream.filter((d) => d.id !== id),
      downstream: prev.downstream.filter((d) => d.id !== id),
    }));
  }

  return (
    <div className="space-y-4" data-testid="dependency-list">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#94a3b8]">
          {view.upstream.length} upstream · {view.downstream.length} downstream
        </p>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded border border-[#2a2d3e] text-sm text-white px-2 py-1 hover:bg-[#1a1d27]"
            data-testid="dependency-add-button"
          >
            <Plus className="w-4 h-4" />
            Add dependency
          </button>
        )}
      </div>

      {showAdd && (
        <DependencyForm
          experimentId={experimentId}
          peerOptions={peerOptions}
          onCreated={async () => {
            await refresh();
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section data-testid="dependency-upstream-section">
          <h3 className="text-xs uppercase tracking-wide text-[#94a3b8] inline-flex items-center gap-1.5 mb-2">
            <ArrowRight className="w-3.5 h-3.5" />
            Upstream — this depends on
          </h3>
          {view.upstream.length === 0 ? (
            <p className="text-sm text-[#94a3b8] italic">No upstream dependencies.</p>
          ) : (
            <ul className="space-y-2">
              {view.upstream.map((d: ExperimentDependencyHydrated) => (
                <li key={d.id}>
                  <DependencyCard
                    edge={d}
                    direction="upstream"
                    onRemoved={handleRemoved}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section data-testid="dependency-downstream-section">
          <h3 className="text-xs uppercase tracking-wide text-[#94a3b8] inline-flex items-center gap-1.5 mb-2">
            <ArrowLeft className="w-3.5 h-3.5" />
            Downstream — depends on this
          </h3>
          {view.downstream.length === 0 ? (
            <p className="text-sm text-[#94a3b8] italic">No downstream dependencies.</p>
          ) : (
            <ul className="space-y-2">
              {view.downstream.map((d: ExperimentDependencyHydrated) => (
                <li key={d.id}>
                  <DependencyCard
                    edge={d}
                    direction="downstream"
                    onRemoved={handleRemoved}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
