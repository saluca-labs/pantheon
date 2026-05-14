/**
 * CyberSec OS — hub dashboard-spec adapter (Wave C, UI Depth Wave).
 *
 * Pure data-shape adapter: turns the Cyber repo payloads
 * (`CyberDashboardStats` + `TrendsPayload` + recent `Alert[]`) into the
 * declarative `DashboardSpec` consumed by `_shared/DashboardHub`'s new
 * `dashboard` prop. No DB access, no React — the hub server component
 * fetches the data and calls this to assemble the spec.
 *
 * This is the "minimal primitive data-shape adapter" the Wave C-2a brief
 * allows under `lib/agentic-os/cyber/`. It introduces no new queries.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import type {
  DashboardSpec,
  DashboardWidgetSpec,
} from '@/components/agentic-os/_shared/dashboard-hub';
import type { ActivityEvent } from '@/components/agentic-os/_shared/views';
import type { CyberDashboardStats, TrendsPayload } from './repo';
import type { Alert, AlertSeverity } from './triage';

/** Severity → ActivityFeed tone for the recent-alerts feed. */
const SEVERITY_TONE: Record<AlertSeverity, ActivityEvent['tone']> = {
  critical: 'danger',
  high: 'attention',
  medium: 'warning',
  low: 'accent',
  info: 'neutral',
};

/**
 * Build the recent-active-alerts ActivityFeed events. Mirrors the old hub's
 * "Recent active alerts" panel — same data (top active alerts, severity
 * desc), now as a primitive feed. `occurredAt` drives ordering / grouping.
 */
export function buildCyberActivityEvents(alerts: Alert[]): ActivityEvent[] {
  return alerts.map((a) => ({
    id: a.id,
    occurredAt: a.occurredAt,
    summary: a.title,
    actor: a.severity.toUpperCase(),
    tone: SEVERITY_TONE[a.severity] ?? 'neutral',
    href: '/dashboard/os/cyber/alerts',
  }));
}

/**
 * Assemble the full `DashboardSpec` for the CyberSec OS hub.
 *
 * - `widgets`: aggregate SecOps state — open / critical alerts, total +
 *   critical assets, open exposures + MTTR, IOC hits, active log sources.
 *   Each drills into its underlying list page via `href`.
 * - `chart`: 30-day alert volume (total / critical / high) as a bar chart,
 *   sourced from `TrendsPayload.alertsByDay`.
 * - `activity`: recent active alerts, severity-toned.
 */
export function buildCyberDashboardSpec(args: {
  stats: CyberDashboardStats;
  trends: TrendsPayload;
  recentAlerts: Alert[];
}): DashboardSpec {
  const { stats, trends, recentAlerts } = args;

  const mttrLabel =
    trends.exposuresMttrDays != null
      ? `${trends.exposuresMttrDays.toFixed(1)}d avg MTTR`
      : 'No remediation history yet';

  const widgets: DashboardWidgetSpec[] = [
    {
      title: 'Open alerts',
      href: '/dashboard/os/cyber/alerts',
      variant: stats.criticalAlerts > 0 ? 'danger' : 'default',
      'data-testid': 'cyber-widget-open-alerts',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {stats.openAlerts}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            <span className="tabular-nums">{stats.alertsLast24h}</span> in the
            last 24h
          </p>
        </div>
      ),
    },
    {
      title: 'Critical alerts',
      href: '/dashboard/os/cyber/alerts',
      variant: stats.criticalAlerts > 0 ? 'attention' : 'default',
      'data-testid': 'cyber-widget-critical-alerts',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {stats.criticalAlerts}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            <span className="tabular-nums">{stats.alertsLast7d}</span> alerts in
            the last 7d
          </p>
        </div>
      ),
    },
    {
      title: 'Assets',
      href: '/dashboard/os/cyber/assets',
      'data-testid': 'cyber-widget-assets',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {stats.totalAssets}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            <span className="tabular-nums">{stats.criticalAssets}</span>{' '}
            critical
          </p>
        </div>
      ),
    },
    {
      title: 'Open exposures',
      href: '/dashboard/os/cyber/exposures',
      variant: trends.exposuresOpen > 0 ? 'warning' : 'default',
      'data-testid': 'cyber-widget-exposures',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {trends.exposuresOpen}
          </p>
          <p className="mt-1 text-xs text-text-secondary">{mttrLabel}</p>
        </div>
      ),
    },
    {
      title: 'IOC hits (7d)',
      href: '/dashboard/os/cyber/iocs',
      'data-testid': 'cyber-widget-ioc-hits',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {trends.iocHitsLast7d}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            <span className="tabular-nums">{trends.iocHitsLast30d}</span> in the
            last 30d
          </p>
        </div>
      ),
    },
    {
      title: 'Active log sources',
      href: '/dashboard/os/cyber/log-sources',
      'data-testid': 'cyber-widget-log-sources',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {stats.activeLogSources}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            feeding the alert pipeline
          </p>
        </div>
      ),
    },
  ];

  return {
    widgets,
    chart: {
      title: 'Alert volume (30d)',
      kind: 'bar',
      height: 220,
      series: [
        {
          key: 'total',
          label: 'Total',
          data: trends.alertsByDay.map((d) => ({ x: d.date, y: d.total })),
        },
        {
          key: 'critical',
          label: 'Critical',
          data: trends.alertsByDay.map((d) => ({ x: d.date, y: d.critical })),
        },
        {
          key: 'high',
          label: 'High',
          data: trends.alertsByDay.map((d) => ({ x: d.date, y: d.high })),
        },
      ],
      emptyState: {
        title: 'No alerts in the last 30 days',
        description:
          'Alert volume will chart here once your log sources start feeding the pipeline.',
      },
    },
    activity: {
      events: buildCyberActivityEvents(recentAlerts),
      grouping: 'none',
      emptyState: {
        title: 'No active alerts',
        description: 'New alerts will show up here as they come in.',
      },
    },
  };
}
