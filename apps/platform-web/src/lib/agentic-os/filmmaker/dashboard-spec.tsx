/**
 * Filmmaker OS — hub dashboard-spec adapter (Wave C-5, UI Depth Wave).
 *
 * Pure data-shape adapter: turns the Filmmaker repo payload
 * (`FilmmakerProject[]` — the user's project list) into the declarative
 * `DashboardSpec` consumed by `_shared/DashboardHub`'s `dashboard` prop
 * (v0.1.61). No DB access, no React component state — the hub server
 * component fetches the data and calls this to assemble the spec.
 *
 * This is the "minimal primitive data-shape adapter" the Wave C brief allows
 * under `lib/agentic-os/filmmaker/`. It introduces no new queries — it reads
 * the same `listProjects` payload the projects surface already uses.
 *
 * Filmmaker is feature-complete (8 features) but, like Secure-Dev, it has no
 * cross-project time-series surface — the per-OS adoption matrix marks
 * `ChartCard` as skip (—) for Filmmaker. So the spec ships `widgets` +
 * `activity` only and omits `chart`; `DashboardHub` renders fine without it.
 *
 *  - `widgets`  — aggregate production state: total projects, projects in
 *                 active production / post, next target-completion date, and
 *                 average production-phase progress across the slate.
 *  - `activity` — the recently-touched projects, status-toned, each drilling
 *                 into its project hub.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import type {
  DashboardSpec,
  DashboardWidgetSpec,
} from '@/components/agentic-os/_shared/dashboard-hub';
import type { ActivityEvent } from '@/components/agentic-os/_shared/views';
import {
  PROJECT_STATUS_LABELS,
  PHASE_KEYS,
  type FilmmakerProject,
  type ProjectStatus,
} from './projects';

/** How many recently-touched projects the activity feed surfaces. */
const ACTIVITY_LIMIT = 8;

/** Project status → ActivityFeed tone for the recent-projects feed. */
const STATUS_TONE: Record<ProjectStatus, ActivityEvent['tone']> = {
  pre_production: 'accent',
  production: 'warning',
  post_production: 'attention',
  wrapped: 'positive',
  archived: 'neutral',
};

/**
 * Mean of the five production-phase progress percentages for one project
 * (0-100). Pure — mirrors the `PhaseProgressEditor` math so the hub and the
 * per-project tracker agree on "how far along".
 */
function projectPhaseAverage(project: FilmmakerProject): number {
  const sum = PHASE_KEYS.reduce(
    (acc, key) => acc + project.phaseProgress[key],
    0,
  );
  return Math.round(sum / PHASE_KEYS.length);
}

/**
 * The soonest (non-archived) target-completion date across the slate, or
 * `null` when no project has one set. Returns the owning project too so the
 * widget can name it.
 */
function nextTargetDate(
  projects: FilmmakerProject[],
): { date: string; project: FilmmakerProject } | null {
  let best: { date: string; project: FilmmakerProject } | null = null;
  for (const p of projects) {
    if (p.status === 'archived' || !p.targetCompletionDate) continue;
    if (!best || p.targetCompletionDate < best.date) {
      best = { date: p.targetCompletionDate, project: p };
    }
  }
  return best;
}

/**
 * Build the recent-projects ActivityFeed events. Each project links into its
 * project hub; the actor is the project name, the summary is its production
 * status, and the tone follows the production phase.
 */
export function buildFilmmakerActivityEvents(
  projects: FilmmakerProject[],
): ActivityEvent[] {
  return projects.slice(0, ACTIVITY_LIMIT).map((p) => ({
    id: p.id,
    occurredAt: p.updatedAt,
    actor: p.name,
    summary: `${PROJECT_STATUS_LABELS[p.status]} · ${projectPhaseAverage(p)}% through production`,
    tone: STATUS_TONE[p.status] ?? 'neutral',
    href: `/dashboard/os/filmmaker/projects/${p.id}`,
  }));
}

/**
 * Assemble the `DashboardSpec` for the Filmmaker OS hub.
 *
 * - `widgets`: aggregate production state — total projects, projects in
 *   active production / post, the next target-completion date, and the
 *   average phase progress across the slate. Each drills into the projects
 *   surface via `href`.
 * - `activity`: the recently-touched projects, status-toned.
 * - `chart` is intentionally omitted — Filmmaker has no cross-project
 *   time-series surface (adoption matrix marks ChartCard `—` for Filmmaker).
 */
export function buildFilmmakerDashboardSpec(args: {
  projects: FilmmakerProject[];
}): DashboardSpec {
  const { projects } = args;

  const inProduction = projects.filter(
    (p) => p.status === 'production' || p.status === 'post_production',
  ).length;
  const wrapped = projects.filter((p) => p.status === 'wrapped').length;
  const next = nextTargetDate(projects);
  const activeProjects = projects.filter((p) => p.status !== 'archived');
  const avgProgress =
    activeProjects.length === 0
      ? 0
      : Math.round(
          activeProjects.reduce((acc, p) => acc + projectPhaseAverage(p), 0) /
            activeProjects.length,
        );

  const widgets: DashboardWidgetSpec[] = [
    {
      title: 'Projects',
      href: '/dashboard/os/filmmaker/projects',
      'data-testid': 'filmmaker-widget-projects',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {projects.length}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {projects.length === 0 ? (
              'no projects yet'
            ) : (
              <>
                <span className="tabular-nums">{wrapped}</span> wrapped
              </>
            )}
          </p>
        </div>
      ),
    },
    {
      title: 'In production',
      href: '/dashboard/os/filmmaker/projects',
      variant: inProduction > 0 ? 'attention' : 'default',
      'data-testid': 'filmmaker-widget-in-production',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {inProduction}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {inProduction === 0
              ? 'nothing shooting or in post right now'
              : 'project(s) shooting or in post-production'}
          </p>
        </div>
      ),
    },
    {
      title: 'Next target date',
      href: '/dashboard/os/filmmaker/projects',
      'data-testid': 'filmmaker-widget-next-target',
      children: (
        <div>
          {next ? (
            <>
              <p className="text-lg font-semibold tabular-nums text-text-primary">
                {next.date}
              </p>
              <p className="mt-1 truncate text-xs text-text-secondary">
                {next.project.name}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-text-secondary">
                None set
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                add a target completion date to track a deadline
              </p>
            </>
          )}
        </div>
      ),
    },
    {
      title: 'Avg. phase progress',
      href: '/dashboard/os/filmmaker/projects',
      'data-testid': 'filmmaker-widget-avg-progress',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {avgProgress}
            <span className="text-lg text-text-secondary">%</span>
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {activeProjects.length === 0
              ? 'no active projects to average'
              : `across ${activeProjects.length} active project${activeProjects.length === 1 ? '' : 's'}`}
          </p>
        </div>
      ),
    },
  ];

  return {
    widgets,
    activity: {
      events: buildFilmmakerActivityEvents(projects),
      grouping: 'day',
      emptyState: {
        title: 'No projects yet',
        description:
          'Your film projects show up here. Create your first project to start breaking down a script.',
        primaryCta: {
          label: 'Create a project',
          href: '/dashboard/os/filmmaker/projects',
        },
      },
    },
  };
}
