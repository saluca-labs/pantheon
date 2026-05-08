'use client';

/**
 * Filmmaker OS — ProjectsManager client component.
 *
 * Renders the project list with name / status / description, a new-project
 * creation form, and a status dropdown. Clicking a project navigates to the
 * shot list for that project via /dashboard/os/filmmaker/shots?projectId=<id>.
 *
 * All data is fetched from /api/tiresias/agentic-os/filmmaker/projects.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import Link from 'next/link';
import type { FilmmakerProject, ProjectStatus } from '@/lib/agentic-os/filmmaker/projects';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '@/lib/agentic-os/filmmaker/projects';

const API = '/api/tiresias/agentic-os/filmmaker/projects';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

const STATUS_COLOR: Record<ProjectStatus, string> = {
  pre_production: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  production: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  post_production: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  wrapped: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  archived: 'text-[#94a3b8] bg-[#1a1d27] border-[#2a2d3e]',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">{label}</span>
      {children}
    </label>
  );
}

// ─── New Project Form ────────────────────────────────────────────────────────

function NewProjectForm({ onCreated }: { onCreated: (p: FilmmakerProject) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('pre_production');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          status,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { project } = await r.json();
      onCreated(project);
      setName('');
      setDescription('');
      setStatus('pre_production');
      setTags('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
      <h3 className="text-sm font-semibold text-white">New project</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Project name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Short Film 2025"
            className={inputCls}
            required
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            className={inputCls}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional synopsis or log line"
          className={inputCls}
        />
      </Field>
      <Field label="Tags (comma-separated)">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="e.g. drama, short, documentary"
          className={inputCls}
        />
      </Field>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 text-sm transition"
        >
          {saving ? 'Creating…' : 'Create project'}
        </button>
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </form>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: FilmmakerProject }) {
  return (
    <Link
      href={`/dashboard/os/filmmaker/shots?projectId=${project.id}`}
      className="block rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 hover:border-[#4361EE]/50 transition group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-white font-medium group-hover:text-[#4361EE] transition">
              {project.name}
            </h3>
            <span
              className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_COLOR[project.status]}`}
            >
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
          </div>
          {project.description && (
            <p className="text-sm text-[#94a3b8] mt-1 truncate">{project.description}</p>
          )}
          {project.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {project.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#94a3b8]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-[#94a3b8] group-hover:text-white group-hover:border-[#4361EE]/50 transition">
          Shot list →
        </span>
      </div>
    </Link>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ProjectsManager({ initialProjects }: { initialProjects: FilmmakerProject[] }) {
  const [projects, setProjects] = useState<FilmmakerProject[]>(initialProjects);

  function onCreated(p: FilmmakerProject) {
    setProjects((prev) => [p, ...prev]);
  }

  return (
    <div className="space-y-6">
      <NewProjectForm onCreated={onCreated} />

      {projects.length === 0 ? (
        <p className="text-sm text-[#94a3b8]">
          No projects yet. Create your first project above.
        </p>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
