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
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const STATUS_BADGE: Record<ToolStatus, string> = {
  active: 'border-positive/50 text-positive bg-positive/5',
  down: 'border-warning/50 text-warning bg-warning/5',
  retired: 'border-border-subtle text-text-secondary bg-surface-0',
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
        <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Picker */}
      <form
        onSubmit={attach}
        className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3"
      >
        <h3 className="text-xs font-semibold text-white uppercase tracking-wide">
          Pick from your workshop
        </h3>
        {availableTools.length === 0 ? (
          <p className="text-xs text-text-secondary">
            All your tools are already attached. Need a new tool?{' '}
            <Link
              href="/dashboard/os/maker/tools"
              className="text-accent hover:underline"
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
              <label className="inline-flex items-center gap-2 text-xs text-text-primary">
                <input
                  type="checkbox"
                  checked={pickedRequired}
                  onChange={(e) => setPickedRequired(e.target.checked)}
                  className="rounded border-border-subtle bg-surface-0"
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
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-50 inline-flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              {attaching ? 'Attaching…' : 'Attach tool'}
            </button>
          </>
        )}
      </form>

      {/* Linked tools */}
      {links.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-2/50 p-8 text-center">
          <p className="text-sm text-text-secondary">
            No tools linked yet. Pick one from the workshop above to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border-subtle bg-surface-0/50">
              <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
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
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-0/30 transition"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/os/maker/tools/${link.toolId}`}
                      className="text-white hover:text-accent transition font-medium"
                    >
                      {link.toolName}
                    </Link>
                    {link.notes && (
                      <div className="text-[10px] text-text-secondary mt-0.5">
                        {link.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-primary">
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
                          ? 'border-danger/50 text-danger hover:bg-danger/10'
                          : 'border-border-subtle text-text-secondary hover:bg-border-subtle'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          link.required ? 'bg-danger' : 'bg-text-secondary'
                        }`}
                      />
                      {link.required ? 'Required' : 'Optional'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => detach(link)}
                      className="rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-[10px] text-danger hover:bg-danger/10 inline-flex items-center gap-1 transition"
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
