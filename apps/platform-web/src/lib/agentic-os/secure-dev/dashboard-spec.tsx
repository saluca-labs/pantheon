/**
 * Secure-Dev OS — hub dashboard-spec adapter (Wave C-4b, UI Depth Wave).
 *
 * Pure data-shape adapter: turns the Secure-Dev repo payload
 * (`ThreatModelRow[]` — the saved STRIDE checklists) into the declarative
 * `DashboardSpec` consumed by `_shared/DashboardHub`'s `dashboard` prop
 * (v0.1.61). No DB access, no React component state — the hub server
 * component fetches the data and calls this to assemble the spec.
 *
 * This is the "minimal primitive data-shape adapter" the Wave C brief allows
 * under `lib/agentic-os/secure-dev/`. It introduces no new queries — it reads
 * the same `listThreatModels` payload the threat-model surface already uses.
 *
 * Secure-Dev is an early-stage OS: one feature (the STRIDE threat-model
 * walkthrough), one persisted entity (`agos_secdev_threat_models`). There is
 * no time-series surface worth charting yet, so the spec ships `widgets` +
 * `activity` only and omits `chart`.
 *
 * @license MIT — Tiresias Secure-Dev OS (internal).
 */

import type {
  DashboardSpec,
  DashboardWidgetSpec,
} from '@/components/agentic-os/_shared/dashboard-hub';
import type { ActivityEvent } from '@/components/agentic-os/_shared/views';
import type { ThreatModelRow } from './repo';
import type { ThreatSeverity } from './stride';
import { summariseChecklist } from './stride';

/** How many recent threat models the activity feed surfaces. */
const ACTIVITY_LIMIT = 8;

/** Threat severity → ActivityFeed tone for the recent-models feed. */
const SEVERITY_TONE: Record<ThreatSeverity, ActivityEvent['tone']> = {
  high: 'danger',
  medium: 'warning',
  low: 'accent',
};

/**
 * Per-model triggered-threat counts by severity, plus the total triggered.
 * Pure — reuses the `stride.ts` `summariseChecklist` helper so the hub and
 * the walkthrough surface count threats identically.
 */
function modelSummary(model: ThreatModelRow): {
  high: number;
  medium: number;
  low: number;
  triggered: number;
} {
  const counts = summariseChecklist(model.checklist);
  return {
    ...counts,
    triggered: counts.high + counts.medium + counts.low,
  };
}

/** The highest-severity tone present in a model's triggered threats. */
function modelTone(model: ThreatModelRow): ActivityEvent['tone'] {
  const s = modelSummary(model);
  if (s.high > 0) return SEVERITY_TONE.high;
  if (s.medium > 0) return SEVERITY_TONE.medium;
  if (s.low > 0) return SEVERITY_TONE.low;
  return 'neutral';
}

/**
 * Build the recent-threat-models ActivityFeed events. Each row links into the
 * STRIDE threat-model surface; the actor is the system name, the summary is
 * the triggered-threat count, and the tone escalates with the worst triggered
 * severity in that model.
 */
export function buildSecureDevActivityEvents(
  models: ThreatModelRow[],
): ActivityEvent[] {
  return models.slice(0, ACTIVITY_LIMIT).map((m) => {
    const s = modelSummary(m);
    return {
      id: m.id,
      occurredAt: m.createdAt,
      actor: m.systemName,
      summary:
        s.triggered === 0
          ? 'no threats triggered'
          : `${s.triggered} threat${s.triggered === 1 ? '' : 's'} triggered`,
      tone: modelTone(m),
      href: '/dashboard/os/secure-dev/threat-model',
    };
  });
}

/**
 * Assemble the `DashboardSpec` for the Secure-Dev OS hub.
 *
 * - `widgets`: aggregate threat-modeling state — total saved models, the
 *   sum of triggered high-severity threats across every model (danger-tinted
 *   when any exist), and the most recent model's system name. Each drills
 *   into the STRIDE threat-model surface via `href`.
 * - `activity`: the recent saved threat models, severity-toned.
 * - `chart` is intentionally omitted — Secure-Dev has no time-series surface
 *   yet. `DashboardHub` renders the region fine with widgets + activity only.
 */
export function buildSecureDevDashboardSpec(args: {
  models: ThreatModelRow[];
}): DashboardSpec {
  const { models } = args;

  const summaries = models.map(modelSummary);
  const highTotal = summaries.reduce((sum, s) => sum + s.high, 0);
  const triggeredTotal = summaries.reduce((sum, s) => sum + s.triggered, 0);
  const latest = models[0]; // repo returns created_at DESC

  const widgets: DashboardWidgetSpec[] = [
    {
      title: 'Threat models',
      href: '/dashboard/os/secure-dev/threat-model',
      'data-testid': 'secure-dev-widget-threat-models',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {models.length}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {models.length === 0 ? (
              'no STRIDE models saved yet'
            ) : (
              <>
                <span className="tabular-nums">{triggeredTotal}</span> threat
                {triggeredTotal === 1 ? '' : 's'} triggered across all models
              </>
            )}
          </p>
        </div>
      ),
    },
    {
      title: 'High-severity threats',
      href: '/dashboard/os/secure-dev/threat-model',
      variant: highTotal > 0 ? 'danger' : 'default',
      'data-testid': 'secure-dev-widget-high-threats',
      children: (
        <div>
          <p className="text-3xl font-semibold tabular-nums text-text-primary">
            {highTotal}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {highTotal === 0
              ? 'no high-severity threats triggered'
              : 'triggered across your saved models — review mitigations'}
          </p>
        </div>
      ),
    },
    {
      title: 'Latest model',
      href: '/dashboard/os/secure-dev/threat-model',
      'data-testid': 'secure-dev-widget-latest-model',
      children: (
        <div>
          {latest ? (
            <>
              <p className="truncate text-lg font-semibold text-text-primary">
                {latest.systemName}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {modelSummary(latest).triggered} threat
                {modelSummary(latest).triggered === 1 ? '' : 's'} triggered
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-text-secondary">
                Nothing yet
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                run the STRIDE walkthrough to model your first system
              </p>
            </>
          )}
        </div>
      ),
    },
  ];

  return {
    widgets,
    activity: {
      events: buildSecureDevActivityEvents(models),
      grouping: 'day',
      emptyState: {
        title: 'No threat models yet',
        description:
          'Saved STRIDE threat models show up here. Run the walkthrough to model your first system.',
        primaryCta: {
          label: 'Start a threat model',
          href: '/dashboard/os/secure-dev/threat-model',
        },
      },
    },
  };
}
