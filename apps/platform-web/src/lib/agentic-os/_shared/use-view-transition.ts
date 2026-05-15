'use client';

/**
 * useViewTransition — client hook around `document.startViewTransition`.
 *
 * Returns a callable that wraps a navigation / state-update callback in
 * the browser's View Transitions API when supported, and falls back to a
 * synchronous call otherwise. Used by `DashboardHub` to animate the
 * feature-grid `<Link>` navigations as cross-document view transitions
 * on supported browsers (the broader rollout across list → detail
 * navigations is explicit W-E.5 scope; do not adopt elsewhere yet).
 *
 * Pairs with:
 *  - `next.config.ts`             → `experimental.viewTransition: true`
 *  - `globals.css`                → `@view-transition { navigation: auto; }`
 *
 * Wave E.3 hook. Standalone — Sub B does not touch this; it's wired
 * exclusively on `DashboardHub` for v0.1.79.
 *
 * Spec sources:
 *  - _design/tokens.md §9 Motion → "View transitions (W-E.3)"
 *  - PANTHEON_UI_DEPTH_WAVE_PLAN.md W-E.3 scoping
 */

import { useCallback } from 'react';

/**
 * Minimal type for the View Transitions API surface we use. Avoids
 * pulling lib-dom updates into tsconfig just for one optional method —
 * the runtime feature-detect via `'startViewTransition' in document` is
 * the source of truth.
 */
type DocumentWithViewTransitions = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => unknown;
};

/**
 * Returns a stable callable. Call it with the navigation / state-update
 * callback. When the browser supports `document.startViewTransition`,
 * the callback runs inside the transition; otherwise the callback runs
 * synchronously (graceful no-op fallback — the navigation still happens,
 * just without the animation).
 *
 * Stable identity across renders (memoized with no deps) so consumers
 * can pass it into effect deps / event handlers without re-binding.
 */
export function useViewTransition(): (
  callback: () => void | Promise<void>,
) => void {
  return useCallback((callback: () => void | Promise<void>): void => {
    if (typeof document === 'undefined') {
      // SSR / non-browser path: nothing to do — RSC will render the new
      // route, so we just execute the callback synchronously.
      void callback();
      return;
    }
    const doc = document as DocumentWithViewTransitions;
    if (typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(callback);
      return;
    }
    // Unsupported browser: just run the callback. The navigation still
    // happens; only the animation is dropped.
    void callback();
  }, []);
}
