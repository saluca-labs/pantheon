/**
 * Spinner — the one true inline loading-indicator primitive.
 *
 * A thin wrapper around `lucide-react`'s `Loader2` so the icon library
 * stays single-sourced and the OS surfaces get one seam to swap behavior
 * later (e.g. for a custom shimmer). NOT a skeleton replacement: use
 * Skeleton for shape-known loading, Spinner for inline indicators
 * inside buttons / status pills where no shape exists to skeletonize.
 *
 * Wave E.3 primitive. Standalone — Sub B's fan-out adopts this inside
 * buttons (e.g. ActivityFeed's "Load more" gets a `<Spinner size="xs" />`
 * prepended to the existing label).
 *
 * Spec sources:
 *  - _design/tokens.md §9 Motion → "Loading primitives (W-E.3)"
 *  - _design/visual-language.md "Loading / empty / error states"
 */

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Sizing taxonomy — tightly bound to the in-app uses:
 *  - `xs` — inside button labels (Load more, Save & continue)
 *  - `sm` — default, small affordances + status pills
 *  - `md` — standalone inline indicators
 *  - `inline` — inherits `font-size` from the parent, useful when the
 *    spinner sits in flowing text and should match the line-height
 */
export type SpinnerSize = 'xs' | 'sm' | 'md' | 'inline';

export interface SpinnerProps {
  /** Sizing. Defaults to `sm` — the most common small-affordance shape. */
  size?: SpinnerSize;
  /**
   * Optional screen-reader-only label. When set, a `<span class="sr-only">`
   * is rendered alongside the icon and `aria-hidden` is dropped from the
   * icon so it participates in the a11y tree as a `Loading` indicator.
   * Supply this whenever the spinner stands alone (no neighbouring
   * visible text already names the loading state).
   */
  label?: string;
  /** Extra classes appended via `cn(...)` so overrides win. */
  className?: string;
  /** Optional test id override. Defaults to `spinner`. */
  'data-testid'?: string;
}

/**
 * Per-size class mapping. Sized as squares so the spin centers cleanly.
 */
const SIZE_CLASSES: Record<SpinnerSize, string> = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  inline: 'w-[1em] h-[1em]',
};

/**
 * Render a thin animated loader icon. By default decorative
 * (`aria-hidden="true"`); supply `label` to make it semantically visible.
 */
export function Spinner({
  size = 'sm',
  label,
  className,
  'data-testid': testId,
}: SpinnerProps) {
  const hasLabel = label !== undefined && label !== '';

  if (hasLabel) {
    return (
      <span
        className="inline-flex items-center"
        data-testid={testId ?? 'spinner'}
      >
        <Loader2
          aria-hidden={false}
          className={cn('animate-spin', SIZE_CLASSES[size], className)}
        />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <Loader2
      aria-hidden
      data-testid={testId ?? 'spinner'}
      className={cn('animate-spin', SIZE_CLASSES[size], className)}
    />
  );
}
