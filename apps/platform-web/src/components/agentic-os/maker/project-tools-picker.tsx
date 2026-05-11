'use client';

/**
 * Maker OS — ProjectToolsPicker.
 *
 * Per-project Tools tab. Shows the linked tools as a table (with required
 * toggle + remove button), and a combobox-style picker that loads the
 * workshop catalog from /maker/tools and attaches one via POST /tools.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import {
  TOOL_KIND_LABELS,
  TOOL_STATUS_LABELS,
  type Tool,
  type ToolStatus,
  type ProjectToolJoined,
} from '@/lib/agentic-os/maker/tools';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

const STATUS_BADGE: Record<ToolStatus, string> = {
  active: 'border-emerald-500/50 text-emerald-300 bg-emerald-500/5',
  down: 'border-amber-500/50 text-amber-300 bg-amber-500/5',
  retired: 'border-[#2a2d3e] text-[#94a3b8] bg-[#0f1117]',
};

interface Props {
  projectId: string;
  initialLinks: ProjectToolJoined[];
  /** Pre-loaded workshop tools (server-rendered to avoid a first-paint fetch). */
  initialWorkshopTools: Tool[];
}

export function ProjectToolsPicker({
  projectId,
  initialLinks,
  initialWorkshopTools,
}: Props) {
  const [links, setLinks] = useState<ProjectToolJoined[]>(initialLinks);
  const [workshop, setWorkshop] = useState<Tool[]>(initialWorkshopTools);
  const [pickedToolId, setPickedToolId] = useState<string>('');
  const [pickedRequired, setPickedRequired] = useState(true);
  const [pickedNotes, setPickedNotes] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = `/api/tiresias/agentic-os/maker/projects/${projectId}/tools`;

  const refreshLinks = useCallback(async () => {
    const r = await fetch(apiBase);
    if (r.ok) {
      const { tools } = await r.json();
      setLinks(tools ?? []);
    }
  }, [apiBase]);

  const refreshWorkshop = useCallback(async () => {
    const r = await fetch('/api/tiresias/agentic-os/maker/tools');
    if (r.ok) {
      const { tools } = await r.json();
      setWorkshop(tools ?? []);
    }
  }, []);

  useEffect(() => {
    void refreshLinks();
    void refreshWorkshop();
  }, [refreshLinks, refreshWorkshop]);

  const linkedToolIds = useMemo(
    () => new Set(links.map((l) => l.toolId)),
    [links],
  );
  const availableTools = useMemo(
    () => workshop.filter((t) => !linkedToolIds.has(t.id)),
    [workshop, linkedToolIds],
  );

  async function attach(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pickedToolId) {
      setError('Pick a tool first.');
      return;
    }
    setAttaching(true);
    setError(null);
    try {
      const r = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolId: pickedToolId,
          required: pickedRequired,
          notes: pickedNotes.trim() || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (r.status === 409) {
          throw new Error('That tool is already attached to this project.');
        }
        throw new Error(d.error ?? `Attach failed (${r.status})`);
      }
      setPickedToolId('');
      setPickedRequired(true);
      setPickedNotes('');
      await refreshLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAttaching(false);
    }
  }

  async function toggleRequired(link: ProjectToolJoined) {
    const next = !link.required;
    const prev = links;
    setLinks((arr) =>
      arr.map((l) => (l.id === link.id ? { ...l, required: next } : l)),
    );
    try {
      const r = await fetch(`${apiBase}/${link.toolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ required: next }),
      });
      if (!r.ok) throw new Error(`Toggle failed (${r.status})`);
      await refreshLinks();
    } catch (err) {
      setLinks(prev);
      setError(err instanceof Error ? err.message : 'Toggle failed');
    }
  }

  async function detach(link: ProjectToolJoined) {
    if (!confirm(`Detach "${link.toolName}" from this project?`)) return;
    const prev = links;
    setLinks((arr) => arr.filter((l) => l.id !== link.id));
    try {
      const r = await fetch(`${apiBase}/${link.toolId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`Detach failed (${r.status})`);
    } catch (err) {
      setLinks(prev);
      setError(err instanceof Error ? err.message : 'Detach failed');
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Picker */}
      <form
        onSubmit={attach}
        className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 space-y-3"
      >
        <h3 className="text-xs font-semibold text-white uppercase tracking-wide">
          Pick from your workshop
        </h3>
        {availableTools.length === 0 ? (
          <p className="text-xs text-[#94a3b8]">
            All your tools are already attached. Need a new tool?{' '}
            <Link
              href="/dashboard/os/maker/tools"
              className="text-[#4361EE] hover:underline"
            >
              Add one to the workshop
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={pickedToolId}
                onChange={(e) => setPickedToolId(e.target.value)}
                className={inputCls}
                required
              >
                <option value="">Choose a tool…</option>
                {availableTools.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({TOOL_KIND_LABELS[t.kind]})
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 text-xs text-[#cbd5e1]">
                <input
                  type="checkbox"
                  checked={pickedRequired}
                  onChange={(e) => setPickedRequired(e.target.checked)}
                  className="rounded border-[#2a2d3e] bg-[#0f1117]"
                />
                Required for this build
              </label>
            </div>
            <input
              type="text"
              placeholder="Notes (optional)"
              value={pickedNotes}
              onChange={(e) => setPickedNotes(e.target.value)}
              className={inputCls}
            />
            <button
              type="submit"
              disabled={attaching || !pickedToolId}
              className="rounded-md bg-[#4361EE] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4361EE]/80 disabled:opacity-50 inline-flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              {attaching ? 'Attaching…' : 'Attach tool'}
            </button>
          </>
        )}
      </form>

      {/* Linked tools */}
      {links.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27]/50 p-8 text-center">
          <p className="text-sm text-[#94a3b8]">
            No tools linked yet. Pick one from the workshop above to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-[#2a2d3e] bg-[#0f1117]/50">
              <tr className="text-left text-xs uppercase tracking-wide text-[#94a3b8]">
                <th className="px-4 py-3 font-medium">Tool</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Required</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr
                  key={link.id}
                  className="border-b border-[#2a2d3e] last:border-b-0 hover:bg-[#0f1117]/30 transition"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/os/maker/tools/${link.toolId}`}
                      className="text-white hover:text-[#4361EE] transition font-medium"
                    >
                      {link.toolName}
                    </Link>
                    {link.notes && (
                      <div className="text-[10px] text-[#94a3b8] mt-0.5">
                        {link.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#cbd5e1]">
                    {TOOL_KIND_LABELS[link.toolKind]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_BADGE[link.toolStatus]}`}
                    >
                      {TOOL_STATUS_LABELS[link.toolStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleRequired(link)}
                      className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border transition ${
                        link.required
                          ? 'border-red-500/50 text-red-300 hover:bg-red-500/10'
                          : 'border-[#2a2d3e] text-[#94a3b8] hover:bg-[#2a2d3e]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          link.required ? 'bg-red-400' : 'bg-[#94a3b8]'
                        }`}
                      />
                      {link.required ? 'Required' : 'Optional'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => detach(link)}
                      className="rounded-md border border-[#2a2d3e] bg-[#1a1d27] px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10 inline-flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
