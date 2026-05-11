'use client';

/**
 * Maker OS — DependencyPicker.
 *
 * Modal for selecting another project to depend on, picking a kind, and
 * optionally adding notes. Calls
 * POST /api/tiresias/agentic-os/maker/projects/[id]/dependencies on submit.
 *
 * Surfaces:
 *   - 400 self-loop (the UI doesn't let you pick the current project)
 *   - 404 if the user picks a project they no longer own
 *   - 409 duplicate edge
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  DEPENDENCY_KIND_VALUES,
  DEPENDENCY_KIND_LABELS,
  type DependencyKind,
} from '@/lib/agentic-os/maker/dependencies';
import type { MakerProject } from '@/lib/agentic-os/maker/repo';

const API_BASE = '/api/tiresias/agentic-os/maker';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

interface Props {
  projectId: string;
  candidateProjects: MakerProject[];
  existingPeerIds: Set<string>;
  onClose: () => void;
  onCreated: () => void;
}

export function DependencyPicker({
  projectId,
  candidateProjects,
  existingPeerIds,
  onClose,
  onCreated,
}: Props) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState<DependencyKind>('blocks');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter the candidate list: drop the current project, drop existing
  // peers (the parent passes the set of peer ids that already have an
  // edge from this project), and apply the search filter.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return candidateProjects.filter((p) => {
      if (p.id === projectId) return false;
      if (existingPeerIds.has(p.id)) return false;
      if (term && !p.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [candidateProjects, projectId, existingPeerIds, search]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId) {
      setError('Pick a project to depend on.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_project_id: selectedId,
          kind,
          notes: notes.trim() || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (r.status === 409) throw new Error('That dependency already exists.');
        if (r.status === 404)
          throw new Error("The selected project isn't available anymore.");
        throw new Error(d.error ?? `Create failed (${r.status})`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg space-y-4 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-white">Add a dependency</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[#94a3b8] hover:text-white"
            aria-label="Close picker"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[#94a3b8]">
          Pick another project this build depends on. The blockers widget surfaces
          open edges of kind <code className="text-[#cbd5e1]">blocks</code>.
        </p>

        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
            Search projects
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type to filter…"
            className={inputCls}
          />
          <div className="max-h-48 overflow-y-auto rounded-md border border-[#2a2d3e] bg-[#0f1117]">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#94a3b8]">
                No matching projects.
              </p>
            ) : (
              <ul>
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={`block w-full px-3 py-2 text-left text-xs transition ${
                        selectedId === p.id
                          ? 'bg-[#4361EE]/20 text-white'
                          : 'text-[#cbd5e1] hover:bg-[#1a1d27]'
                      }`}
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-wide text-[#94a3b8]">Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DependencyKind)}
            className={inputCls}
          >
            {DEPENDENCY_KIND_VALUES.map((k) => (
              <option key={k} value={k}>
                {DEPENDENCY_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
            Notes
          </label>
          <textarea
            rows={3}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional context"
            className={`${inputCls} resize-y`}
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#2a2d3e] px-4 py-2 text-sm text-[#94a3b8] hover:bg-[#0f1117] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !selectedId}
            className="rounded-md bg-[#4361EE] px-4 py-2 text-sm font-medium text-white hover:bg-[#3651D9] disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add dependency'}
          </button>
        </div>
      </form>
    </div>
  );
}
