'use client';

/**
 * Maker OS — ProjectsManager client component.
 *
 * Card-style project list with filter (status), sort (name, created, target
 * completion), and — Wave C-3a — in-hub search, saved filter/sort presets,
 * and multi-select bulk archive. Clicking a card opens the Project Hub. A
 * "New project" button opens a drawer with the full create form.
 *
 * Wave C-3a primitive adoption:
 *  - `MakerListControls` (EntitySearch + SavedViews) replaces the ad-hoc
 *    search gap; the native status / sort selects move into its
 *    `filterControls` slot.
 *  - `BulkActionsBar` + a new lightweight selection model on `ProjectCard`
 *    drives bulk archive (the existing per-project PATCH route, batched).
 *  - `EmptyState` replaces the ad-hoc "No projects…" `<p>`.
 *
 * Behavior-preserving: same data, routes, and the same create-drawer +
 * filter/sort logic (`applyProjectFilters` is untouched).
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { useCallback, useMemo, useState } from 'react';
import { Plus, Wrench, Archive } from 'lucide-react';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from '@/lib/agentic-os/maker/projects';
import type { MakerProject } from '@/lib/agentic-os/maker/repo';
import { BulkActionsBar, EmptyState } from '@/components/agentic-os/_shared/views';
import { ProjectCard } from './project-card';
import { MakerListControls, type MakerQuery } from './maker-list-controls';

const API = '/api/tiresias/agentic-os/maker/projects';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export type SortKey = 'name' | 'created' | 'target';
export type StatusFilter = ProjectStatus | 'all';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

// ─── Sort / filter helpers (exported for tests) ──────────────────────────────

export function applyProjectFilters(
  projects: MakerProject[],
  opts: { status: StatusFilter; sort: SortKey },
): MakerProject[] {
  let filtered = projects;
  if (opts.status !== 'all') filtered = filtered.filter((p) => p.status === opts.status);

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

/**
 * Free-text search over a project's name, description, and tags. Pure +
 * exported so the search behavior is unit-testable.
 */
export function matchesProjectSearch(p: MakerProject, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    p.name.toLowerCase().includes(q) ||
    (p.description ?? '').toLowerCase().includes(q) ||
    p.tags.some((t) => t.toLowerCase().includes(q))
  );
}

// ─── New Project Drawer ──────────────────────────────────────────────────────

function NewProjectDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: MakerProject) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('concept');
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
        status,
        coverImageUrl: coverImageUrl.trim() || null,
        targetCompletionDate: targetCompletionDate || null,
        teamSize: teamSize ? Number(teamSize) : null,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
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
            placeholder="e.g. CNC router v2"
            required
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputCls + ' resize-none'}
            placeholder="What is this build?"
          />
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
              placeholder="e.g. 1"
            />
          </Field>
        </div>

        <Field label="Tags (comma-separated)">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className={inputCls}
            placeholder="electronics, CNC, 3D printing"
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          {error && <span className="text-sm text-danger mr-auto">{error}</span>}
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
            className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
          >
            {saving ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ProjectsManager({ initialProjects }: { initialProjects: MakerProject[] }) {
  const [projects, setProjects] = useState<MakerProject[]>(initialProjects);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('created');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [archiving, setArchiving] = useState(false);

  const visible = useMemo(() => {
    const filtered = applyProjectFilters(projects, { status: statusFilter, sort });
    return filtered.filter((p) => matchesProjectSearch(p, search));
  }, [projects, statusFilter, sort, search]);

  function onCreated(p: MakerProject) {
    setProjects((prev) => [p, ...prev]);
    setCreating(false);
  }

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  // Bulk archive — batches the existing per-project PATCH route. Same action
  // a user could take one card at a time; the bar just fans it out.
  async function archiveSelected(ids: string[]) {
    setArchiving(true);
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`${API}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'archived' }),
          }).then((r) => ({ id, ok: r.ok })),
        ),
      );
      const archived = new Set(results.filter((r) => r.ok).map((r) => r.id));
      setProjects((prev) =>
        prev.map((p) =>
          archived.has(p.id) ? { ...p, status: 'archived' as ProjectStatus } : p,
        ),
      );
      setSelectedIds((prev) => prev.filter((id) => !archived.has(id)));
    } finally {
      setArchiving(false);
    }
  }

  // Saved-view query carries status / sort / search; apply restores all three.
  const filters = useMemo<MakerQuery>(
    () => ({ status: statusFilter, sort }),
    [statusFilter, sort],
  );

  function applyQuery(q: MakerQuery) {
    setStatusFilter((q.status as StatusFilter) || 'all');
    setSort((q.sort as SortKey) || 'created');
    setSearch(q.search ?? '');
  }

  return (
    <div className="space-y-6">
      <MakerListControls
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search projects by name, description, or tag"
        filters={filters}
        onApplyQuery={applyQuery}
        savedViewKey="projects"
        filterControls={
          <>
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
          </>
        }
        actions={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium px-4 py-2 text-sm transition"
          >
            <Plus className="w-4 h-4" />
            New project
          </button>
        }
      />

      {visible.length === 0 ? (
        projects.length === 0 ? (
          <EmptyState
            icon={<Wrench className="h-6 w-6" />}
            title="No projects yet"
            description="Each project tracks a 7-phase build lifecycle with its own BOM, build log, milestones, tools, and references."
            primaryCta={{
              label: 'New project',
              icon: <Plus className="h-4 w-4" />,
              onClick: () => setCreating(true),
            }}
          />
        ) : (
          <EmptyState
            variant="bare"
            icon={<Wrench className="h-6 w-6" />}
            title="No projects match"
            description="Try clearing the search or adjusting the status filter."
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.map((p) => (
            <ProjectCard
              key={p.id}
              selectable
              selected={selectedIds.includes(p.id)}
              onToggleSelect={toggleSelect}
              project={{
                id: p.id,
                name: p.name,
                description: p.description,
                status: p.status,
                tags: p.tags,
                coverImageUrl: p.coverImageUrl,
                targetCompletionDate: p.targetCompletionDate,
                teamSize: p.teamSize,
                phaseProgress: p.phaseProgress,
              }}
            />
          ))}
        </div>
      )}

      <BulkActionsBar
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        countLabel={(n) => `${n} project${n === 1 ? '' : 's'} selected`}
        actions={[
          {
            id: 'archive',
            label: archiving ? 'Archiving…' : 'Archive',
            icon: <Archive className="h-3.5 w-3.5" />,
            disabled: archiving,
            onClick: archiveSelected,
          },
        ]}
      />

      {creating && (
        <NewProjectDrawer onClose={() => setCreating(false)} onCreated={onCreated} />
      )}
    </div>
  );
}
