/**
 * Research OS — hub dashboard-widget strip.
 *
 * Wave C-2b (UI Depth Wave) — converts the Research hub from a directory
 * into a dashboard. Renders aggregate-state `DashboardWidget` tiles above
 * the experiments grid: experiment count by status, active hypotheses,
 * literature size, and open blockers.
 *
 * Pure / presentational: the hub page already loads experiments + the
 * top-blockers snapshot; this component derives every figure from those
 * props with no extra API/DB calls. The hypotheses + literature counts
 * are passed in by the page (loaded from the existing repos).
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { FlaskConical, Lightbulb, BookOpenText, ShieldAlert } from 'lucide-react';
import { DashboardWidget } from '@/components/agentic-os/_shared/views';
import type { ResearchExperiment } from '@/lib/agentic-os/research/repo';
import type { BlockerItem } from '@/lib/agentic-os/research/blockers';
import { EXPERIMENT_STATUS_LABELS } from '@/lib/agentic-os/research/experiments';

interface Props {
  experiments: ResearchExperiment[];
  blockers: BlockerItem[];
  hypothesisCount: number;
  literatureCount: number;
}

export function ResearchHubWidgets({
  experiments,
  blockers,
  hypothesisCount,
  literatureCount,
}: Props) {
  const active = experiments.filter((e) => e.archivedAt == null);
  const running = active.filter((e) => e.status === 'running').length;
  const archived = experiments.length - active.length;

  const highBlockers = blockers.filter((b) => b.severity === 'high').length;
  const blockerVariant =
    highBlockers > 0 ? 'attention' : blockers.length > 0 ? 'warning' : 'default';

  // Status mix for the experiments widget body — only non-zero buckets.
  const statusCounts = new Map<string, number>();
  for (const e of active) {
    statusCounts.set(e.status, (statusCounts.get(e.status) ?? 0) + 1);
  }

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="research-hub-widgets"
    >
      <DashboardWidget
        title="Experiments"
        osSlug="research"
        icon={<FlaskConical className="h-4 w-4" />}
        href="/dashboard/os/research/experiments"
        footer={
          archived > 0
            ? `${archived} archived`
            : 'All experiments active'
        }
      >
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-text-primary">
            {active.length}
          </span>
          <span className="text-xs text-text-secondary">
            {running} running
          </span>
        </div>
        {statusCounts.size > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {Array.from(statusCounts.entries()).map(([status, count]) => (
              <span
                key={status}
                className="rounded bg-surface-3 px-1.5 py-0.5 text-2xs text-text-tertiary"
              >
                {EXPERIMENT_STATUS_LABELS[
                  status as keyof typeof EXPERIMENT_STATUS_LABELS
                ] ?? status}{' '}
                <span className="tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        )}
      </DashboardWidget>

      <DashboardWidget
        title="Hypotheses"
        osSlug="research"
        icon={<Lightbulb className="h-4 w-4" />}
        href="/dashboard/os/research/hypotheses"
        footer="Active in the ledger"
      >
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {hypothesisCount}
        </span>
      </DashboardWidget>

      <DashboardWidget
        title="Literature"
        osSlug="research"
        icon={<BookOpenText className="h-4 w-4" />}
        href="/dashboard/os/research/library"
        footer="Papers in the library"
      >
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {literatureCount}
        </span>
      </DashboardWidget>

      <DashboardWidget
        title="Open blockers"
        osSlug="research"
        icon={<ShieldAlert className="h-4 w-4" />}
        variant={blockerVariant}
        href="/dashboard/os/research/blockers"
        footer={
          highBlockers > 0
            ? `${highBlockers} high severity`
            : blockers.length > 0
              ? 'All medium severity'
              : 'Nothing blocking'
        }
      >
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {blockers.length}
        </span>
      </DashboardWidget>
    </div>
  );
}
