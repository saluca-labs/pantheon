import Link from 'next/link';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AgenticOsModule } from '@/lib/agentic-os/registry';
import { PlanViewer } from '@/components/agentic-os/plan-viewer';
import {
  ActivityFeed,
  ChartCard,
  DashboardWidget,
} from '@/components/agentic-os/_shared/views';
import type {
  ActivityEvent,
  ActivityFeedProps,
  ChartCardProps,
  DashboardWidgetProps,
} from '@/components/agentic-os/_shared/views';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  live: {
    label: 'Live',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  preview: {
    label: 'Preview',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  planned: {
    label: 'Planned',
    className: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  },
};

/* ──────────────────────────────────────────────────────────────────────────
 * Declarative dashboard-region spec types.
 *
 * Each `*Spec` is a thin data descriptor over the corresponding
 * `_shared/views` primitive: the primitive's real props minus the bits the
 * hub can supply a default for (the root layout class, `osSlug`, which is
 * threaded from `module.slug`). Consumers import these to build specs; the
 * hub renders them through the actual primitives. Render-props that can't be
 * expressed declaratively (e.g. ActivityFeed's `renderItem`, ChartCard's
 * `onRangeChange`) are passed through unchanged as optional callbacks.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * One `DashboardWidget` in the dashboard region's grid. Mirrors
 * `DashboardWidgetProps` exactly — `children` is the widget body and is
 * required, same as the primitive. `osSlug` is optional here: when omitted
 * the hub threads `module.slug` through so per-OS accents apply by default.
 */
export type DashboardWidgetSpec = DashboardWidgetProps;

/**
 * The `ChartCard` for the dashboard region. Mirrors `ChartCardProps`
 * exactly. `osSlug` is optional: the hub threads `module.slug` through when
 * it is omitted so the chart's accent matches the OS.
 */
export type ChartCardSpec = ChartCardProps;

/**
 * The `ActivityFeed` for the dashboard region. Mirrors `ActivityFeedProps`
 * (`events` required, everything else optional). `renderItem` and
 * `onLoadMore` are preserved as the primitive's render-prop / callback
 * escape hatches. `ActivityFeed` takes no `osSlug`, so nothing is threaded.
 */
export type ActivityFeedSpec<TEvent extends ActivityEvent = ActivityEvent> =
  ActivityFeedProps<TEvent>;

/**
 * Declarative dashboard region. Any subset of the three primitives can be
 * supplied; each is rendered through its real `_shared/views` primitive.
 * Use the `dashboardSlot` escape hatch on `DashboardHubProps` instead when
 * raw composition is needed.
 */
export interface DashboardSpec {
  /** Rendered as a responsive `DashboardWidget` grid. */
  widgets?: DashboardWidgetSpec[];
  /** Rendered as a single `ChartCard`. */
  chart?: ChartCardSpec;
  /** Rendered as a single `ActivityFeed`. */
  activity?: ActivityFeedSpec;
}

export interface DashboardHubProps {
  /** The OS module from `lib/agentic-os/registry.ts`. */
  module: AgenticOsModule;
  /**
   * Optional banner rendered above the feature grid — used by Health OS
   * for the active-risk-flags surface, but reusable for any
   * cross-feature alert (e.g. licensing, integration outages).
   */
  flagBanner?: ReactNode;
  /**
   * Optional consent gate rendered below the feature grid — kept inline
   * (not modal) so it never blocks navigation back to /dashboard/os.
   */
  consentGate?: ReactNode;
  /**
   * Roadmap markdown to render in the collapsed accordion. Pass `null`
   * to suppress the accordion entirely.
   */
  roadmapMarkdown?: string | null;
  /**
   * Declarative dashboard region — rendered above the feature grid in a
   * default-open collapsible section. Supply any subset of widgets / chart
   * / activity; each is rendered through the real `_shared/views`
   * primitive. Ignored entirely when `dashboardSlot` is also provided.
   * When neither this nor `dashboardSlot` is set, no dashboard region is
   * rendered at all.
   */
  dashboard?: DashboardSpec;
  /**
   * Escape hatch: raw composition for the dashboard region. When provided,
   * this overrides `dashboard` entirely — the node is rendered inside the
   * same default-open collapsible section and the declarative `dashboard`
   * prop is ignored.
   */
  dashboardSlot?: ReactNode;
}

/**
 * Renders the declarative dashboard region from a `DashboardSpec` using the
 * real `_shared/views` primitives. `module.slug` is threaded into the
 * widget grid + chart as the default `osSlug` so per-OS accents apply
 * without the consumer repeating the slug on every spec.
 */
function DashboardRegion({
  spec,
  slug,
}: {
  spec: DashboardSpec;
  slug: AgenticOsModule['slug'];
}) {
  const osSlug = slug as DashboardWidgetProps['osSlug'];
  const hasWidgets = (spec.widgets?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4" data-testid="dashboard-hub-region">
      {hasWidgets ? (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="dashboard-hub-widget-grid"
        >
          {spec.widgets!.map((widget, i) => (
            <DashboardWidget
              key={widget['data-testid'] ?? i}
              osSlug={osSlug}
              {...widget}
            />
          ))}
        </div>
      ) : null}

      {spec.chart ? (
        <ChartCard osSlug={osSlug} {...spec.chart} />
      ) : null}

      {spec.activity ? <ActivityFeed {...spec.activity} /> : null}
    </div>
  );
}

/**
 * Cross-OS dashboard hub. Replaces the per-OS implementation of the
 * features-first shell from `[slug]/page.tsx` so each OS only needs to
 * supply its module + optional surfaces (flag banner, consent gate,
 * declarative dashboard region).
 *
 * Phase 1 of Health OS uses this as its primary page; subsequent OSes
 * adopt it in their own phase to keep diffs small.
 */
export function DashboardHub({
  module,
  flagBanner,
  consentGate,
  roadmapMarkdown,
  dashboard,
  dashboardSlot,
}: DashboardHubProps) {
  const Icon = module.icon;
  const badge = STATUS_BADGE[module.status] ?? STATUS_BADGE['planned']!;
  const hasFeatures = module.features.length > 0;

  // `dashboardSlot` wins over `dashboard`. With neither, no region renders
  // (no empty collapsible) — this is what keeps the no-new-props path
  // byte-identical to the pre-refactor shell.
  const dashboardContent: ReactNode = dashboardSlot ? (
    dashboardSlot
  ) : dashboard ? (
    <DashboardRegion spec={dashboard} slug={module.slug} />
  ) : null;

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All Agentic OS modules
      </Link>

      {/* Compact metadata header — icon, name, status, tagline, description. */}
      <header className="rounded-xl border border-border-subtle bg-surface-2 p-5 mb-5">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-surface-0 p-2.5 border border-border-subtle">
            <Icon className="w-6 h-6 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-semibold text-white">{module.label}</h1>
              <span
                className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
            <p className="text-text-secondary text-sm">{module.tagline}</p>
            <p className="text-sm text-text-primary/80 mt-2 leading-relaxed">
              {module.description}
            </p>
          </div>
        </div>
      </header>

      {flagBanner ? <div className="mb-5">{flagBanner}</div> : null}

      {/* Declarative dashboard region — above the feature grid, in a
          default-open collapsible matching the roadmap accordion pattern.
          Only rendered when `dashboard` or `dashboardSlot` is supplied. */}
      {dashboardContent !== null && (
        <details
          open
          className="group rounded-xl border border-border-subtle bg-surface-2 mb-5"
          data-testid="dashboard-hub-dashboard-details"
        >
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 p-4 text-sm text-text-primary hover:text-white transition">
            <span className="flex items-center gap-2">
              <ChevronDown className="w-4 h-4 text-text-secondary transition group-open:rotate-180" />
              <span className="font-medium">Dashboard</span>
              <span className="text-xs text-text-secondary">(at a glance)</span>
            </span>
          </summary>
          <div className="px-6 pb-6 pt-2 border-t border-border-subtle">
            {dashboardContent}
          </div>
        </details>
      )}

      {/* Primary content: feature grid. */}
      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Features</h2>
          {hasFeatures && (
            <span className="text-xs text-text-secondary">
              {module.features.length}{' '}
              {module.features.length === 1 ? 'feature' : 'features'} available
            </span>
          )}
        </div>

        {hasFeatures ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {module.features.map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className="group rounded-xl border border-border-subtle bg-surface-2 p-5 hover:border-accent/60 hover:bg-surface-3 transition flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-base font-semibold text-white mb-1">
                    {feature.label}
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-secondary group-hover:text-accent mt-1 shrink-0 transition" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border-subtle bg-surface-2/50 p-6 text-center">
            <p className="text-sm font-medium text-white mb-1">Coming soon</p>
            <p className="text-xs text-text-secondary">
              {module.status === 'preview'
                ? 'Schema and plan are live. Feature pages roll out in the parallel rollout phase.'
                : 'Feature pages for this module have not shipped yet.'}{' '}
              Track progress in the execution roadmap below.
            </p>
          </div>
        )}
      </section>

      {consentGate ? <div className="mb-6">{consentGate}</div> : null}

      {/* Secondary content: collapsed execution roadmap. */}
      {roadmapMarkdown !== null && (
        <details className="group rounded-xl border border-border-subtle bg-surface-2">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 p-4 text-sm text-text-primary hover:text-white transition">
            <span className="flex items-center gap-2">
              <ChevronDown className="w-4 h-4 text-text-secondary transition group-open:rotate-180" />
              <span className="font-medium">View execution roadmap</span>
              <span className="text-xs text-text-secondary">(full plan markdown)</span>
            </span>
          </summary>
          <div className="px-6 pb-6 pt-2 border-t border-border-subtle">
            {roadmapMarkdown ? (
              <PlanViewer markdown={roadmapMarkdown} />
            ) : (
              <p className="text-text-secondary text-sm">
                Execution plan not available for this module yet.
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
