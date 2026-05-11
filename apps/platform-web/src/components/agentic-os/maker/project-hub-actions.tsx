'use client';

/**
 * Maker OS — Project Hub edit/delete actions.
 *
 * Renders the Edit button (opens a drawer to patch project metadata) and the
 * Delete button (confirm + cascade delete via FK). Mirrors the shape of the
 * Filmmaker equivalent so the Project-Hub header looks/works the same across
 * OSes.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from '@/lib/agentic-os/maker/projects';
import type { MakerProject } from '@/lib/agentic-os/maker/repo';

interface Props {
  project: MakerProject;
}

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-[#94a3b8]/80 mt-1">{hint}</span>}
    </label>
  );
}

export function ProjectHubActions({ project }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const r = await fetch(`/api/tiresias/agentic-os/maker/projects/${project.id}`, {
        method: 'DELETE',
      });
      if (!r.ok) throw new Error(`Delete failed (${r.status})`);
      router.push('/dashboard/os/maker/projects');
      router.refresh();
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] hover:border-[#4361EE]/60 text-white transition"
      >
        <Pencil className="w-3.5 h-3.5" />
        Edit
      </button>
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:border-red-500/60 text-red-300 transition"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>

      {editing && (
        <EditDrawer
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Delete project?</h3>
            <p className="text-sm text-[#94a3b8]">
              This deletes <span className="text-white font-medium">{project.name}</span> and
              every linked part. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/60 text-white px-4 py-2 text-sm transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-500/80 hover:bg-red-500 disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
              >
                {deleting ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edit Drawer ─────────────────────────────────────────────────────────────

function EditDrawer({
  project,
  onClose,
  onSaved,
}: {
  project: MakerProject;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? '',
    status: project.status as ProjectStatus,
    coverImageUrl: project.coverImageUrl ?? '',
    targetCompletionDate: project.targetCompletionDate ?? '',
    teamSize: project.teamSize == null ? '' : String(project.teamSize),
    tags: project.tags.join(', '),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
        coverImageUrl: form.coverImageUrl.trim() || null,
        targetCompletionDate: form.targetCompletionDate || null,
        teamSize: form.teamSize ? Number(form.teamSize) : null,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const r = await fetch(`/api/tiresias/agentic-os/maker/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Save failed (${r.status})`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60">
      <form
        onSubmit={submit}
        className="h-full w-full max-w-md overflow-y-auto border-l border-[#2a2d3e] bg-[#0f1117] p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Edit project</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[#94a3b8] hover:text-white transition"
          >
            Close
          </button>
        </div>

        <Field label="Name">
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className={inputCls}
            required
          />
        </Field>

        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            className={inputCls + ' resize-none'}
          />
        </Field>

        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => set('status', e.target.value as ProjectStatus)}
            className={inputCls}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Cover image URL"
          hint="External URL only — asset uploads are a future MCP-mediated workstream."
        >
          <input
            type="url"
            value={form.coverImageUrl}
            onChange={(e) => set('coverImageUrl', e.target.value)}
            className={inputCls}
            placeholder="https://…"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Target completion">
            <input
              type="date"
              value={form.targetCompletionDate}
              onChange={(e) => set('targetCompletionDate', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Team size">
            <input
              type="number"
              min={0}
              value={form.teamSize}
              onChange={(e) => set('teamSize', e.target.value)}
              className={inputCls}
              placeholder="e.g. 1"
            />
          </Field>
        </div>

        <Field label="Tags (comma-separated)">
          <input
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            className={inputCls}
            placeholder="electronics, CNC, 3D printing"
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          {error && <span className="text-sm text-red-300 mr-auto">{error}</span>}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/60 text-white px-4 py-2 text-sm transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
