'use client';

/**
 * Maker OS — DependenciesTab.
 *
 * Two-list view for the project Dependencies tab:
 *
 *   Upstream   — projects this one depends on.
 *   Downstream — projects that depend on this one.
 *
 * Add-dependency button opens DependencyPicker. Each edge row shows
 * status + kind + notes + clear / re-open / remove actions.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import {
  DEPENDENCY_KIND_LABELS,
  type ProjectDependenciesView,
  type ProjectDependencyHydrated,
} from '@/lib/agentic-os/maker/dependencies';
import type { MakerProject } from '@/lib/agentic-os/maker/repo';
import { DependencyPicker } from './dependency-picker';

const API_BASE = '/api/tiresias/agentic-os/maker';

interface Props {
  projectId: string;
  initial: ProjectDependenciesView;
  candidateProjects: MakerProject[];
}

export function DependenciesTab({ projectId, initial, candidateProjects }: Props) {
  const [view, setView] = useState<ProjectDependenciesView>(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch(`${API_BASE}/projects/${projectId}/dependencies`);
    if (r.ok) {
      const next = await r.json();
      setView(next ?? { upstream: [], downstream: [] });
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Build the set of peer ids that already have an outbound (upstream) edge
  // from this project so the picker can skip them.
  const existingPeerIds = useMemo(
    () => new Set(view.upstream.map((e) => e.toProjectId)),
    [view.upstream],
  );

  async function clearEdge(edge: ProjectDependencyHydrated, status: 'open' | 'cleared') {
    try {
      const r = await fetch(
        `${API_BASE}/projects/${edge.fromProjectId}/dependencies/${edge.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );
      if (!r.ok) throw new Error(`Patch failed (${r.status})`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Patch failed');
    }
  }

  async function remove(edge: ProjectDependencyHydrated) {
    try {
      const r = await fetch(
        `${API_BASE}/projects/${edge.fromProjectId}/dependencies/${edge.id}`,
        { method: 'DELETE' },
      );
      if (!r.ok) throw new Error(`Delete failed (${r.status})`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[#94a3b8] max-w-prose">
          Wire up cross-project dependencies. Edges of kind{' '}
          <code className="text-[#cbd5e1]">blocks</code> surface in the workshop-wide
          Top Blockers feed when status is <code className="text-[#cbd5e1]">open</code>.
        </p>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#4361EE] px-3 py-2 text-sm font-medium text-white hover:bg-[#3651D9]"
        >
          <Plus className="w-4 h-4" />
          Add dependency
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EdgeList
          title="Upstream"
          subtitle="This project depends on"
          icon={<ArrowUpRight className="w-4 h-4" />}
          edges={view.upstream}
          peerDirection="to"
          onClear={(e) => clearEdge(e, 'cleared')}
          onReopen={(e) => clearEdge(e, 'open')}
          onRemove={remove}
        />
        <EdgeList
          title="Downstream"
          subtitle="Depends on this project"
          icon={<ArrowDownRight className="w-4 h-4" />}
          edges={view.downstream}
          peerDirection="from"
          onClear={(e) => clearEdge(e, 'cleared')}
          onReopen={(e) => clearEdge(e, 'open')}
          onRemove={remove}
        />
      </div>

      {pickerOpen && (
        <DependencyPicker
          projectId={projectId}
          candidateProjects={candidateProjects}
          existingPeerIds={existingPeerIds}
          onClose={() => setPickerOpen(false)}
          onCreated={() => {
            setPickerOpen(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function EdgeList({
  title,
  subtitle,
  icon,
  edges,
  peerDirection,
  onClear,
  onReopen,
  onRemove,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  edges: ProjectDependencyHydrated[];
  peerDirection: 'to' | 'from';
  onClear: (edge: ProjectDependencyHydrated) => void;
  onReopen: (edge: ProjectDependencyHydrated) => void;
  onRemove: (edge: ProjectDependencyHydrated) => void;
}) {
  return (
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <p className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
          {subtitle}
        </p>
      </div>
      {edges.length === 0 ? (
        <p className="text-xs text-[#94a3b8]">No edges.</p>
      ) : (
        <ul className="space-y-2">
          {edges.map((edge) => (
            <li
              key={edge.id}
              className="rounded-md border border-[#2a2d3e] bg-[#0f1117] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/os/maker/projects/${edge.peer.id}`}
                    className="text-sm font-medium text-white hover:text-[#4361EE] truncate"
                  >
                    {edge.peer.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide">
                    <span className="rounded-full border border-[#4361EE]/40 px-2 py-0.5 text-[#cbd5e1]">
                      {DEPENDENCY_KIND_LABELS[edge.kind]}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 ${
                        edge.status === 'open'
                          ? 'border-amber-500/40 text-amber-300'
                          : 'border-emerald-500/40 text-emerald-300'
                      }`}
                    >
                      {edge.status === 'open' ? 'Open' : 'Cleared'}
                    </span>
                    <span className="text-[#94a3b8]">phase {edge.peer.phase}%</span>
                  </div>
                  {edge.notes && (
                    <p className="mt-2 text-xs text-[#cbd5e1] whitespace-pre-wrap">
                      {edge.notes}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {peerDirection === 'to' &&
                    (edge.status === 'open' ? (
                      <button
                        type="button"
                        onClick={() => onClear(edge)}
                        className="text-[10px] uppercase tracking-wide text-emerald-300 hover:underline"
                      >
                        Clear
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onReopen(edge)}
                        className="text-[10px] uppercase tracking-wide text-amber-300 hover:underline"
                      >
                        Reopen
                      </button>
                    ))}
                  {peerDirection === 'to' && (
                    <button
                      type="button"
                      onClick={() => onRemove(edge)}
                      className="rounded p-1 text-[#94a3b8] hover:bg-red-500/10 hover:text-red-300"
                      aria-label="Remove dependency"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {peerDirection === 'from' && (
                    <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
                      read-only
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
