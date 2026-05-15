/**
 * Skeleton — the one true loading-placeholder primitive for Agentic OS.
 *
 * Replaces the dozens of ad-hoc `bg-surface-3 animate-pulse` and (per the
 * Wave E.3 contract violations) `bg-border-subtle animate-pulse` divs
 * scattered across the OSes. Per the visual-language contract: loading
 * states are skeletons (shimmer), never bouncing dots; the shimmer color
 * is `bg-surface-3 animate-pulse` only.
 *
 * Six named variants cover ~95% of the in-app loading shapes. Each
 * variant ships sensible default dimensions; an optional `className`
 * escape hatch handles the genuine outliers. We deliberately do NOT
 * expose width/height props at the variant level — naming the shape is
 * cheaper to read than threading numeric props.
 *
 * Wave E.3 primitive. Standalone — Sub B's fan-out wires this into the
 * ~22 OS surfaces currently inlining the shimmer div.
 *
 * Spec sources:
 *  - _design/visual-language.md "Loading / empty / error states"
 *  - _design/tokens.md §9 Motion → "Loading primitives (W-E.3)"
 */

import { clsx } from 'clsx';
import type { ReactNode } from 'react';

/**
 * Named shape variant. The taxonomy mirrors the `DashboardWidget` /
 * `ActivityFeed` composition vocabulary so callers can match shape to
 * the primitive being loaded.
 */
export type SkeletonVariant =
  | 'text-line'
  | 'avatar'
  | 'card'
  | 'list-row'
  | 'widget'
  | 'block';

export interface SkeletonProps {
  /** Named shape variant. Defaults to `block`. */
  variant?: SkeletonVariant;
  /**
   * Outlier escape hatch — appended to the variant's default classes via
   * `cn(...)` so any width / height / rounding overrides win. Avoid;
   * prefer a more-fitting variant when one exists.
   */
  className?: string;
  /** Optional test id override. Defaults to `skeleton-<variant>`. */
  'data-testid'?: string;
}

/**
 * Base classes that EVERY skeleton variant carries. Defines the
 * visual-language contract surface: skeleton color is `bg-surface-3`,
 * shimmer animation is `animate-pulse`. Do not deviate.
 */
const SKELETON_BASE = 'bg-surface-3 animate-pulse';

/**
 * Per-variant default dimensions + rounding. Keep these tight to the
 * primitive being loaded — `text-line` matches the line-height of body
 * copy, `avatar` matches the 40px icon tile used by activity rows, etc.
 */
const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  'text-line': 'h-4 w-32 rounded-sm',
  avatar: 'h-10 w-10 rounded-full',
  card: 'h-32 w-full rounded-xl',
  'list-row': 'h-12 w-full rounded-md',
  widget: 'h-24 w-full rounded-xl',
  block: 'h-full w-full rounded-lg',
};

/**
 * Render a single skeleton placeholder of the given named variant.
 *
 * Always carries `role="status"` + `aria-busy="true"` for screen-reader
 * semantics (basic a11y scaffolding; the full sweep happens in W-E.4).
 * When composing multiple skeletons together, wrap them in
 * `<SkeletonGroup>` instead so the role hoists to the wrapper and the
 * group is announced once.
 */
export function Skeleton({
  variant = 'block',
  className,
  'data-testid': testId,
}: SkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid={testId ?? `skeleton-${variant}`}
      className={clsx(SKELETON_BASE, VARIANT_CLASSES[variant], className)}
    />
  );
}

export interface SkeletonGroupProps {
  /** Skeleton children (or any composition that uses them). */
  children: ReactNode;
  /** Extra classes on the wrapper. */
  className?: string;
  /** Optional test id override. Defaults to `skeleton-group`. */
  'data-testid'?: string;
}

/**
 * Composition helper for multiple skeletons stacked vertically. Hoists
 * `role="status" aria-busy="true"` to the wrapper so screen readers
 * announce the loading region once instead of per-child, matching the
 * `DashboardWidget` / `ActivityFeed` "I am loading" pattern.
 */
export function SkeletonGroup({
  children,
  className,
  'data-testid': testId,
}: SkeletonGroupProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid={testId ?? 'skeleton-group'}
      className={clsx('space-y-3', className)}
    >
      {children}
    </div>
  );
}
