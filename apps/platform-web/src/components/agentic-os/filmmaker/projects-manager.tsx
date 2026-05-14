'use client';

/**
 * Filmmaker OS — ProjectsManager client component.
 *
 * Card-style project list with filter (status, format) and sort (name,
 * created, target completion). Clicking a card opens the Project Hub.
 * A "New project" button opens a drawer with the full create form.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Clapperboard, Plus } from 'lucide-react';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  FORMATS,
  FORMAT_LABELS,
  type FilmmakerProject,
  type ProjectFormat,
  type ProjectStatus,
} from '@/lib/agentic-os/filmmaker/projects';
import { PhaseProgressMini } from './phase-progress-editor';

const API = '/api/tiresias/agentic-os/filmmaker/projects';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const STATUS_COLOR: Record<ProjectStatus, string> = {
  pre_production: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  production: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  post_production: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  wrapped: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  archived: 'text-text-secondary bg-surface-2 border-border-subtle',
};

type SortKey = 'name' | 'created' | 'target';
type StatusFilter = ProjectStatus | 'all';
type FormatFilter = ProjectFormat | 'all';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">{label}</span>
      {children}
    </label>
  );
}

// ─── Sort / filter helpers ───────────────────────────────────────────────────

export function applyProjectFilters(
  projects: FilmmakerProject[],
  opts: { status: StatusFilter; format: FormatFilter; sort: SortKey },
): FilmmakerProject[] {
  let filtered = projects;
  if (opts.status !== 'all') filtered = filtered.filter((p) => p.status === opts.status);
  if (opts.format !== 'all') filtered = filtered.filter((p) => p.format === opts.format);

  const sorted = [...filtered];
  if (opts.sort === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (opts.sort === 'target') {
    sorted.sort((a, b) => {
      const at = a.targetCompletionDate ?? '9999-99-99';
      const bt = b.targetCompletionDate ?? '9999-99-99';
      return at.localeCompare(bt);
    });
  } else {
    sorted.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  }
  return sorted;
}

// ─── New Project Drawer ──────────────────────────────────────────────────────

function NewProjectDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: FilmmakerProject) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logline, setLogline] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('pre_production');
  const [format, setFormat] = useState<ProjectFormat>('feature');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [targetCompletionDate, setTargetCompletionDate] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        logline: logline.trim() || null,
        status,
        format,
        coverImageUrl: coverImageUrl.trim() || null,
        targetCompletionDate: targetCompletionDate || null,
        teamSize: teamSize ? Number(teamSize) : null,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      };
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { project } = await r.json();
      onCreated(project);
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
        className="h-full w-full max-w-md overflow-y-auto border-l border-border-subtle bg-surface-0 p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">New project</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-text-secondary hover:text-white transition"
          >
            Close
          </button>
        </div>

        <Field label="Project name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder="e.g. Short Film 2025"
            required
          />
        </Field>

        <Field label="Logline">
          <input
            value={logline}
            onChange={(e) => setLogline(e.target.value)}
            className={inputCls}
            placeholder="One-sentence pitch."
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputCls + ' resize-none'}
            placeholder="Synopsis or notes."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Format">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ProjectFormat)}
              className={inputCls}
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className={inputCls}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Cover image URL">
          <input
            type="url"
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            className={inputCls}
            placeholder="https://…"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Target completion">
            <input
              type="date"
              value={targetCompletionDate}
              onChange={(e) => setTargetCompletionDate(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Team size">
            <input
              type="number"
              min={0}
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
              className={inputCls}
              placeholder="e.g. 12"
            />
          </Field>
        </div>

        <Field label="Tags (comma-separated)">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className={inputCls}
            placeholder="drama, festival, micro-budget"
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          {error && <span className="text-sm text-red-300 mr-auto">{error}</span>}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border-subtle bg-surface-0 hover:border-accent/60 text-white px-4 py-2 text-sm transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
          >
            {saving ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Project Card ────────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: FilmmakerProject }) {
  return (
    <Link
      href={`/dashboard/os/filmmaker/projects/${project.id}`}
      className="block rounded-xl border border-border-subtle bg-surface-2 overflow-hidden hover:border-accent/60 transition group"
    >
      <div className="flex">
        {project.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.coverImageUrl}
            alt=""
            className="w-32 h-32 object-cover border-r border-border-subtle shrink-0"
          />
        ) : (
          <div className="w-32 h-32 shrink-0 border-r border-border-subtle bg-gradient-to-br from-accent/15 to-surface-2 flex items-center justify-center">
            <Clapperboard className="w-8 h-8 text-accent/50" />
          </div>
        )}
        <div className="flex-1 min-w-0 p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-medium group-hover:text-accent transition truncate">
              {project.name}
            </h3>
            <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border border-border-subtle bg-surface-0 text-text-primary">
              {FORMAT_LABELS[project.format]}
            </span>
            <span
              className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[project.status]}`}
            >
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
          </div>
          {project.logline && (
            <p className="text-xs text-white/80 italic truncate">{project.logline}</p>
          )}
          {!project.logline && project.description && (
            <p className="text-xs text-text-secondary truncate">{project.description}</p>
          )}
          <PhaseProgressMini phases={project.phaseProgress} />
        </div>
      </div>
    </Link>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ProjectsManager({ initialProjects }: { initialProjects: FilmmakerProject[] }) {
  const [projects, setProjects] = useState<FilmmakerProject[]>(initialProjects);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [sort, setSort] = useState<SortKey>('created');
  const [creating, setCreating] = useState(false);

  const visible = useMemo(
    () => applyProjectFilters(projects, { status: statusFilter, format: formatFilter, sort }),
    [projects, statusFilter, formatFilter, sort],
  );

  function onCreated(p: FilmmakerProject) {
    setProjects((prev) => [p, ...prev]);
    setCreating(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          <Field label="Status">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className={inputCls}
            >
              <option value="all">All</option>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Format">
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value as FormatFilter)}
              className={inputCls}
            >
              <option value="all">All</option>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sort by">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className={inputCls}
            >
              <option value="created">Recently created</option>
              <option value="name">Name</option>
              <option value="target">Target completion</option>
            </select>
          </Field>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-[#3a56d4] text-white font-medium px-4 py-2 text-sm transition"
        >
          <Plus className="w-4 h-4" />
          New project
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {projects.length === 0
            ? 'No projects yet. Create your first project above.'
            : 'No projects match the current filters.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      {creating && (
        <NewProjectDrawer onClose={() => setCreating(false)} onCreated={onCreated} />
      )}
    </div>
  );
}
