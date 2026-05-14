/**
 * Maker OS — hub dashboard-spec adapter (Wave C-3a, UI Depth Wave).
 *
 * Pure data-shape adapter: turns the Maker repo payloads (`MakerProject[]` +
 * `Tool[]` + recent `RecentLogEntry[]` + `BlockerItem[]`) into the
 * declarative `DashboardSpec` consumed by `_shared/DashboardHub`'s `dashboard`
 * prop (v0.1.61). No DB access, no React component state — the hub server
 * component fetches the data and calls this to assemble the spec.
 *
 * This is the "minimal primitive data-shape adapter" the Wave C brief allows
 * under `lib/agentic-os/maker/`. It introduces no new queries.
 *
 * Replaces the pre-Wave-C `flagBanner` strip on the hub (the `RecentActivity
 * Widget` + `BlockersWidget` client components) with declarative widgets +
 * chart + activity feed rendered through the shared primitives.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import type {
  DashboardSpec,
  DashboardWidgetSpec,
} from '@/components/agentic-os/_shared/dashboard-hub';
import type { ActivityEvent } from '@/components/agentic-os/_shared/views';
import type { BlockerItem, BlockerSeverity } from './blockers';
import type { RecentLogEntry } from './log';
import type { MakerProject } from './repo';
import type { Tool } from './tools';
import { summarizeTools } from './tools';
import { projectPhaseAvg } from './projects';

/** Number of trailing days the build-activity chart buckets over. */
const CHART_DAYS = 14;

/** Severity → ActivityFeed tone for the blocker mapping. */
const SEVERITY_TONE: Record<BlockerSeverity, ActivityEvent['tone']> = {
  missed: 'danger',
  blocked: 'danger',
  overdue: 'attention',
  at_risk: 'warning',
  open_dependency: 'accent',
};

/** A project is "active" when it is neither done nor archived. */
function isActiveProject(p: MakerProject): boolean {
  return p.status !== 'done' && p.status !== 'archived';
}

/** YYYY-MM-DD key in UTC for a build-log entry's createdAt. */
function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Build the recent-build-activity ActivityFeed events from the hub's recent
 * log entries. Mirrors the old `RecentActivityWidget` — same data (latest
 * build-log entries across every project, newest first), now as a primitive
 * feed. Each row links into the source project's Build log tab.
 */
export function buildMakerActivityEvents(entries: RecentLogEntry[]): ActivityEvent[] {
  return entries.map((e) => ({
    id: e.id,
    occurredAt: e.createdAt,
    actor: e.projectName,
    summary: e.body,
    tone: 'accent' as const,
    href: `/dashboard/os/maker/projects/${e.projectId}?tab=log`,
  }));
}

/**
 * Bucket the recent log entries into a trailing-`CHART_DAYS` daily count
 * series for the build-activity ChartCard. Entries older than the window are
 * ignored; days with no entries render as a 0 so the axis stays continuous.
 */
function buildActivitySeries(
  entries: RecentLogEntry[],
  today = new Date(),
): { x: string; y: number }[] {
  const counts = new Map<string, number>();
  const days: string[] = [];
  for (let i = CHART_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    days.push(key);
    counts.set(key, 0);
  }
  for (const e of entries) {
    const key = dayKey(e.createdAt);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return days.map((key) => ({ x: key, y: counts.get(key) ?? 0 }));
}

/**
 * Assemble the full `DashboardSpec` for the Maker OS hub.
 *
 * - `widgets`: aggregate workshop state — active projects (+ avg progress),
 *   workshop tools (+ down count), recent build activity (entries in the
 *   chart window), and open blockers (variant escalates on hard blocks).
 *   Each drills into its underlying list page via `href`.
 * - `chart`: trailing-14-day build-log activity as a bar chart.
 * - `activity`: the recent build-log feed, project-linked.
 */
export function buildMakerDashboardSpec(args: {
  projects: MakerProject[];
  tools: Tool[];
  recentLogEntries: RecentLogEntry[];
  blockers: BlockerItem[];
  today?: Date;
}): DashboardSpec {
  const { projects, tools, recentLogEntries, blockers, today } = args;

  const activeProjects = projects.filter(isActiveProject);
  const avgProgress =
    activeProjects.length > 0
      ? Math.round(
          activeProjects.reduce(
            (sum, p) => sum + projectPhaseAvg(p.phaseProgress),
            0,
          ) / activeProjects.length,
        )
      : 0;

  const toolStats = summarizeTools(tools);

  const series = buildActivitySeries(recentLogEntries, today);
  const activityInWindow = series.reduce((sum, p) => sum + p.y, 0);

  // Hard blocks (missed / blocked) escalate the blocker widget; overdue /
  // at-risk are a softer warning; open dependencies stay neutral.
  const hardBlocks = blockers.filter(
    (b) => b.severity === 'missed' || b.severity === 'blocked',
  ).length;
  const softBlocks = blockers.filter(
    (b) => b.severity === 'overdue' || b.severity === 'at_risk',
  ).length;
  const blockerVariant: DashboardWidgetSpec['variant'] =
    hardBlocks > 0 ? 'danger' : softBlocks > 0 ? 'attention' : 'default';

  const widgets: DashboardWidgetSpec[] = [
    {
      title: 'Active projects',
      href: '/dashboard/os/maker/projects',
      'data-testid': 'maker-widget-active-projects',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {activeProjects.length}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {projects.length === activeProjects.length ? (
              'in the workshop'
            ) : (
              <>
                of <span className="tabular-nums">{projects.length}</span> total
              </>
            )}
            {activeProjects.length > 0 && (
              <>
                {' · '}
                <span className="tabular-nums">{avgProgress}%</span> avg progress
              </>
            )}
          </p>
        </div>
      ),
    },
    {
      title: 'Workshop tools',
      href: '/dashboard/os/maker/tools',
      variant: toolStats.down > 0 ? 'warning' : 'default',
      'data-testid': 'maker-widget-tools',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {toolStats.total}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            <span className="tabular-nums">{toolStats.active}</span> active
            {toolStats.down > 0 && (
              <>
                {' · '}
                <span className="tabular-nums text-warning">
                  {toolStats.down}
                </span>{' '}
                down
              </>
            )}
          </p>
        </div>
      ),
    },
    {
      title: 'Recent build activity',
      href: '/dashboard/os/maker/projects',
      'data-testid': 'maker-widget-build-activity',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {activityInWindow}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            build-log {activityInWindow === 1 ? 'entry' : 'entries'} in the last{' '}
            <span className="tabular-nums">{CHART_DAYS}</span> days
          </p>
        </div>
      ),
    },
    {
      title: 'Open blockers',
      href: '/dashboard/os/maker/blockers',
      variant: blockerVariant,
      'data-testid': 'maker-widget-blockers',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {blockers.length}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {blockers.length === 0 ? (
              'all clear across your projects'
            ) : hardBlocks > 0 ? (
              <>
                <span className="tabular-nums text-danger">{hardBlocks}</span>{' '}
                missed or blocked
              </>
            ) : softBlocks > 0 ? (
              <>
                <span className="tabular-nums text-attention">{softBlocks}</span>{' '}
                overdue or at risk
              </>
            ) : (
              'open dependency edges'
            )}
          </p>
        </div>
      ),
    },
  ];

  return {
    widgets,
    chart: {
      title: `Build activity (${CHART_DAYS}d)`,
      kind: 'bar',
      height: 200,
      series: [
        {
          key: 'entries',
          label: 'Build-log entries',
          data: series,
        },
      ],
      emptyState: {
        title: 'No build activity yet',
        description:
          'Build-log entries across your projects will chart here once you start logging work.',
      },
    },
    activity: {
      events: buildMakerActivityEvents(recentLogEntries),
      grouping: 'day',
      emptyState: {
        title: 'No build-log entries yet',
        description:
          'Activity from any project — notes, photos, and links — shows up here as you log it.',
      },
    },
  };
}
