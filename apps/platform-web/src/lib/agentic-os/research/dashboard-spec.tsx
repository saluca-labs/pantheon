/**
 * Research OS — hub dashboard-spec adapter (Wave E-3, UI Depth Wave).
 *
 * Pure data-shape adapter: turns the Research repo payloads (experiments,
 * the top-blockers snapshot, hypothesis + literature counts) into the
 * declarative `DashboardSpec` consumed by `_shared/DashboardHub`'s
 * `dashboard` prop. No DB access, no React component state — the hub
 * server component fetches the data and calls this to assemble the spec.
 *
 * Wave E-3 convergence: the Research hub used to be hand-rolled directly in
 * the page body (bespoke `FlaskConical` header + the `ResearchHubWidgets`
 * strip + the `TopBlockersWidget` + the experiments section). The hub now
 * renders through the shared `DashboardHub` shell like the rest of the
 * suite. The four aggregate stat tiles that lived in `ResearchHubWidgets`
 * (Experiments / Hypotheses / Literature / Open blockers) become the
 * declarative `widgets` grid built here — same figures, same routes, same
 * variant-escalation on high-severity blockers, same footers.
 *
 * The `TopBlockersWidget` (an interactive client component that refreshes
 * on focus) and the experiments section (`ExperimentList` + the hypothesis
 * ledger link) are *not* aggregate "at a glance" state and have no matching
 * declarative slot — they stay as sibling sections rendered by the page
 * after `DashboardHub`, mirroring the Cyber OS recent-assets precedent.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { FlaskConical, Lightbulb, BookOpenText, ShieldAlert } from 'lucide-react';
import type {
  DashboardSpec,
  DashboardWidgetSpec,
} from '@/components/agentic-os/_shared/dashboard-hub';
import type { ResearchExperiment } from '@/lib/agentic-os/research/repo';
import type { BlockerItem } from '@/lib/agentic-os/research/blockers';
import { EXPERIMENT_STATUS_LABELS } from '@/lib/agentic-os/research/experiments';

/**
 * Build the four aggregate stat `DashboardWidget` tiles for the Research
 * hub's dashboard region. Mirrors the retired `ResearchHubWidgets` strip
 * exactly:
 *  - Experiments — active count + running count, status-mix chips, and an
 *    archived-count footer; links to the experiments list.
 *  - Hypotheses  — the active-ledger count; links to the hypothesis ledger.
 *  - Literature  — the library paper count; links to the library.
 *  - Open blockers — the open-blocker count, with the tile variant escalated
 *    to `attention` on any high-severity blocker (`warning` when there are
 *    blockers but none high, `default` when clear) and the matching footer.
 *
 * Pure: every figure is derived from the props the hub already loads — no
 * extra API/DB calls.
 */
export function buildResearchDashboardSpec(args: {
  experiments: ResearchExperiment[];
  blockers: BlockerItem[];
  hypothesisCount: number;
  literatureCount: number;
}): DashboardSpec {
  const { experiments, blockers, hypothesisCount, literatureCount } = args;

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

  const widgets: DashboardWidgetSpec[] = [
    {
      title: 'Experiments',
      icon: <FlaskConical className="h-4 w-4" />,
      href: '/dashboard/os/research/experiments',
      'data-testid': 'research-hub-experiments',
      footer: archived > 0 ? `${archived} archived` : 'All experiments active',
      children: (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-text-primary">
              {active.length}
            </span>
            <span className="text-xs text-text-secondary">{running} running</span>
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
        </>
      ),
    },
    {
      title: 'Hypotheses',
      icon: <Lightbulb className="h-4 w-4" />,
      href: '/dashboard/os/research/hypotheses',
      'data-testid': 'research-hub-hypotheses',
      footer: 'Active in the ledger',
      children: (
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {hypothesisCount}
        </span>
      ),
    },
    {
      title: 'Literature',
      icon: <BookOpenText className="h-4 w-4" />,
      href: '/dashboard/os/research/library',
      'data-testid': 'research-hub-literature',
      footer: 'Papers in the library',
      children: (
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {literatureCount}
        </span>
      ),
    },
    {
      title: 'Open blockers',
      icon: <ShieldAlert className="h-4 w-4" />,
      href: '/dashboard/os/research/blockers',
      'data-testid': 'research-hub-blockers',
      variant: blockerVariant,
      footer:
        highBlockers > 0
          ? `${highBlockers} high severity`
          : blockers.length > 0
            ? 'All medium severity'
            : 'Nothing blocking',
      children: (
        <span className="text-2xl font-semibold tabular-nums text-text-primary">
          {blockers.length}
        </span>
      ),
    },
  ];

  return { widgets };
}
