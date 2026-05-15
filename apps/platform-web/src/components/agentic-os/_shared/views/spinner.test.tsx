/**
 * Wave E.3 — Spinner render + a11y tests.
 *
 * Covers: each size renders the expected `w-_ h-_` class, `aria-hidden`
 * is set when there's no label and unset when one is supplied, the
 * `label` prop emits an `sr-only` span, `className` override appends,
 * `data-testid` passthrough.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './spinner';
import type { SpinnerSize } from './spinner';

describe('Spinner', () => {
  it('defaults to size="sm" with the expected dimensions', () => {
    render(<Spinner />);
    const el = screen.getByTestId('spinner');
    expect(el.tagName.toLowerCase()).toBe('svg');
    expect(el.getAttribute('class') ?? '').toContain('w-3.5');
    expect(el.getAttribute('class') ?? '').toContain('h-3.5');
    expect(el.getAttribute('class') ?? '').toContain('animate-spin');
  });

  it('renders each size with the expected class', () => {
    const cases: Array<{ size: SpinnerSize; classes: string[] }> = [
      { size: 'xs', classes: ['w-3', 'h-3'] },
      { size: 'sm', classes: ['w-3.5', 'h-3.5'] },
      { size: 'md', classes: ['w-4', 'h-4'] },
      { size: 'inline', classes: ['w-[1em]', 'h-[1em]'] },
    ];
    for (const { size, classes } of cases) {
      const { unmount } = render(<Spinner size={size} />);
      const el = screen.getByTestId('spinner');
      for (const cls of classes) {
        expect(el.getAttribute('class') ?? '').toContain(cls);
      }
      unmount();
    }
  });

  it('is aria-hidden by default (decorative)', () => {
    render(<Spinner />);
    const el = screen.getByTestId('spinner');
    expect(el).toHaveAttribute('aria-hidden', 'true');
  });

  it('drops aria-hidden + emits an sr-only span when label is set', () => {
    render(<Spinner label="Loading deals" />);
    const wrapper = screen.getByTestId('spinner');
    // Wrapper is now a <span>, with an svg child + sr-only span.
    expect(wrapper.tagName.toLowerCase()).toBe('span');
    const svg = wrapper.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('false');
    expect(screen.getByText('Loading deals').className).toContain('sr-only');
  });

  it('appends a custom className alongside size + animate-spin', () => {
    render(<Spinner size="md" className="text-accent" />);
    const el = screen.getByTestId('spinner');
    expect(el.getAttribute('class') ?? '').toContain('text-accent');
    expect(el.getAttribute('class') ?? '').toContain('w-4');
    expect(el.getAttribute('class') ?? '').toContain('animate-spin');
  });

  it('passes through a custom data-testid', () => {
    render(<Spinner data-testid="load-more-spin" />);
    expect(screen.getByTestId('load-more-spin')).toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).toBeNull();
  });
});
