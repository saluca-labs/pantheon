'use client';

/**
 * DashboardHubFeatureGrid — the client-side feature-grid for `DashboardHub`.
 *
 * Lifted out of `dashboard-hub.tsx` (a server component) so it can use the
 * `useViewTransition` hook to animate the grid → feature-page navigation
 * via the View Transitions API. This is the ONLY surface we wire view
 * transitions on for v0.1.79 — broader rollout is explicit W-E.5 scope.
 *
 * Visual behavior + classes are byte-identical to the previous inline
 * grid in `dashboard-hub.tsx`. Only the navigation path is wrapped:
 * Cmd/Ctrl/middle-click still let the browser open in a new tab (we
 * preserve modifier intent by not preventing default for those cases).
 *
 * Spec sources:
 *  - _design/tokens.md §9 Motion → "View transitions (W-E.3)"
 *  - PANTHEON_UI_DEPTH_WAVE_PLAN.md W-E.3 scoping
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { AgenticOsFeature } from '@/lib/agentic-os/registry';
import { useViewTransition } from '@/lib/agentic-os/_shared/use-view-transition';

export interface DashboardHubFeatureGridProps {
  features: AgenticOsFeature[];
}

/**
 * Render the feature grid. Each `<Link>` is intercepted via
 * `useViewTransition(...)` so the navigation runs inside a view
 * transition when the browser supports it. Modifier clicks
 * (Cmd / Ctrl / Shift / middle-click) bypass the intercept so they
 * still open in a new tab / window.
 */
export function DashboardHubFeatureGrid({
  features,
}: DashboardHubFeatureGridProps) {
  const router = useRouter();
  const transition = useViewTransition();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {features.map((feature) => (
        // Key on `label` (unique per OS) rather than `href`: some OSes (e.g.
        // filmmaker) intentionally point multiple feature cards at the same
        // route. The previous inline server render emitted the same
        // duplicate-key warning, but React 19 in client components promotes
        // it to a console.error and fails tests.
        <Link
          key={feature.label}
          href={feature.href}
          className="group rounded-xl border border-border-subtle bg-surface-2 p-5 hover:border-accent/60 hover:bg-surface-3 transition flex items-start justify-between gap-3"
          onClick={(event) => {
            // Preserve browser-native open-in-new-tab semantics. Anything
            // with a modifier or non-primary mouse button falls through to
            // the default Link behavior.
            if (
              event.defaultPrevented ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0
            ) {
              return;
            }
            event.preventDefault();
            transition(() => {
              router.push(feature.href);
            });
          }}
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
  );
}
