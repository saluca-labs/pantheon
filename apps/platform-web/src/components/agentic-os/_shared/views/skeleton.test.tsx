/**
 * Wave E.3 — Skeleton + SkeletonGroup render + a11y tests.
 *
 * Covers: each named variant renders with its default dimensions,
 * className override merges with the variant base, aria-busy is always
 * set, data-testid passthrough, SkeletonGroup hoists role to the
 * wrapper and applies the stacking class.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonGroup } from './skeleton';
import type { SkeletonVariant } from './skeleton';

describe('Skeleton', () => {
  it('renders the `block` variant by default with the base shimmer classes', () => {
    render(<Skeleton />);
    const el = screen.getByTestId('skeleton-block');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('bg-surface-3');
    expect(el.className).toContain('animate-pulse');
  });

  it('always sets role="status" and aria-busy="true"', () => {
    render(<Skeleton />);
    const el = screen.getByTestId('skeleton-block');
    expect(el).toHaveAttribute('role', 'status');
    expect(el).toHaveAttribute('aria-busy', 'true');
  });

  it('renders each named variant with the expected default dimensions', () => {
    const cases: Array<{ variant: SkeletonVariant; expected: string[] }> = [
      { variant: 'text-line', expected: ['h-4', 'w-32', 'rounded-sm'] },
      { variant: 'avatar', expected: ['h-10', 'w-10', 'rounded-full'] },
      { variant: 'card', expected: ['h-32', 'w-full', 'rounded-xl'] },
      { variant: 'list-row', expected: ['h-12', 'w-full', 'rounded-md'] },
      { variant: 'widget', expected: ['h-24', 'w-full', 'rounded-xl'] },
      { variant: 'block', expected: ['h-full', 'w-full', 'rounded-lg'] },
    ];
    for (const { variant, expected } of cases) {
      const { unmount } = render(<Skeleton variant={variant} />);
      const el = screen.getByTestId(`skeleton-${variant}`);
      for (const cls of expected) {
        expect(el.className).toContain(cls);
      }
      // base classes carry on every variant
      expect(el.className).toContain('bg-surface-3');
      expect(el.className).toContain('animate-pulse');
      unmount();
    }
  });

  it('merges className with the variant defaults (escape hatch)', () => {
    render(<Skeleton variant="card" className="h-64" />);
    const el = screen.getByTestId('skeleton-card');
    // The override class should be present alongside the variant base.
    expect(el.className).toContain('h-64');
    expect(el.className).toContain('rounded-xl');
  });

  it('passes through a custom data-testid', () => {
    render(<Skeleton variant="text-line" data-testid="my-skel" />);
    expect(screen.getByTestId('my-skel')).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton-text-line')).toBeNull();
  });
});

describe('SkeletonGroup', () => {
  it('hoists role="status" + aria-busy to the wrapper and applies space-y-3', () => {
    render(
      <SkeletonGroup>
        <Skeleton variant="text-line" />
        <Skeleton variant="text-line" />
      </SkeletonGroup>,
    );
    const wrapper = screen.getByTestId('skeleton-group');
    expect(wrapper).toHaveAttribute('role', 'status');
    expect(wrapper).toHaveAttribute('aria-busy', 'true');
    expect(wrapper.className).toContain('space-y-3');
  });

  it('renders nested children', () => {
    render(
      <SkeletonGroup>
        <Skeleton variant="avatar" />
        <Skeleton variant="text-line" />
      </SkeletonGroup>,
    );
    expect(screen.getByTestId('skeleton-avatar')).toBeInTheDocument();
    expect(screen.getByTestId('skeleton-text-line')).toBeInTheDocument();
  });

  it('accepts a custom className', () => {
    render(
      <SkeletonGroup className="mt-8">
        <Skeleton />
      </SkeletonGroup>,
    );
    const wrapper = screen.getByTestId('skeleton-group');
    expect(wrapper.className).toContain('mt-8');
    expect(wrapper.className).toContain('space-y-3');
  });

  it('passes through a custom data-testid', () => {
    render(
      <SkeletonGroup data-testid="my-group">
        <Skeleton />
      </SkeletonGroup>,
    );
    expect(screen.getByTestId('my-group')).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton-group')).toBeNull();
  });
});
