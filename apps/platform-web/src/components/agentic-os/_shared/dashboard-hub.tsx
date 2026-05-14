import Link from 'next/link';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AgenticOsModule } from '@/lib/agentic-os/registry';
import { PlanViewer } from '@/components/agentic-os/plan-viewer';

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
}

/**
 * Cross-OS dashboard hub. Replaces the per-OS implementation of the
 * features-first shell from `[slug]/page.tsx` so each OS only needs to
 * supply its module + optional surfaces (flag banner, consent gate).
 *
 * Phase 1 of Health OS uses this as its primary page; subsequent OSes
 * adopt it in their own phase to keep diffs small.
 */
export function DashboardHub({
  module,
  flagBanner,
  consentGate,
  roadmapMarkdown,
}: DashboardHubProps) {
  const Icon = module.icon;
  const badge = STATUS_BADGE[module.status] ?? STATUS_BADGE['planned']!;
  const hasFeatures = module.features.length > 0;

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
