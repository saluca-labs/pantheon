/**
 * Wave B.1 — DashboardWidget render + slot + variant tests.
 *
 * Covers: title/body/action/footer slots, optional slots absent, all
 * emphasis variants, per-OS accent tinting, the `href` link form, and
 * the default-icon-tint fallback.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';
import { DashboardWidget } from './dashboard-widget';
import type { DashboardWidgetVariant } from './dashboard-widget';

describe('DashboardWidget', () => {
  it('renders the title and body children', () => {
    render(
      <DashboardWidget title="Open deals">
        <span>$42,000</span>
      </DashboardWidget>,
    );
    expect(screen.getByText('Open deals')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-widget-body')).toHaveTextContent(
      '$42,000',
    );
  });

  it('omits the icon, action, and footer slots when not supplied', () => {
    render(
      <DashboardWidget title="Bare">
        <span>body</span>
      </DashboardWidget>,
    );
    expect(screen.queryByTestId('dashboard-widget-icon')).toBeNull();
    expect(screen.queryByTestId('dashboard-widget-action')).toBeNull();
    expect(screen.queryByTestId('dashboard-widget-footer')).toBeNull();
  });

  it('renders the icon slot in a tinted tile', () => {
    render(
      <DashboardWidget title="With icon" icon={<Activity data-testid="ic" />}>
        <span>body</span>
      </DashboardWidget>,
    );
    expect(screen.getByTestId('dashboard-widget-icon')).toBeInTheDocument();
    expect(screen.getByTestId('ic')).toBeInTheDocument();
  });

  it('uses the system accent tint when no osSlug is given', () => {
    render(
      <DashboardWidget title="x" icon={<Activity />}>
        <span>body</span>
      </DashboardWidget>,
    );
    expect(screen.getByTestId('dashboard-widget-icon').className).toContain(
      'text-accent',
    );
  });

  it('uses the per-OS accent tint when osSlug is given', () => {
    render(
      <DashboardWidget title="x" icon={<Activity />} osSlug="business">
        <span>body</span>
      </DashboardWidget>,
    );
    expect(screen.getByTestId('dashboard-widget-icon').className).toContain(
      'text-os-business',
    );
  });

  it('renders the action slot', () => {
    render(
      <DashboardWidget
        title="x"
        action={<button data-testid="act">View all</button>}
      >
        <span>body</span>
      </DashboardWidget>,
    );
    expect(screen.getByTestId('dashboard-widget-action')).toBeInTheDocument();
    expect(screen.getByTestId('act')).toBeInTheDocument();
  });

  it('renders the footer slot', () => {
    render(
      <DashboardWidget title="x" footer={<span>Updated 2m ago</span>}>
        <span>body</span>
      </DashboardWidget>,
    );
    expect(screen.getByTestId('dashboard-widget-footer')).toHaveTextContent(
      'Updated 2m ago',
    );
  });

  it('renders as an anchor with hover affordance when href is supplied', () => {
    render(
      <DashboardWidget title="x" href="/dashboard/os/business/deals">
        <span>body</span>
      </DashboardWidget>,
    );
    const root = screen.getByTestId('dashboard-widget');
    expect(root.tagName).toBe('A');
    expect(root).toHaveAttribute('href', '/dashboard/os/business/deals');
    expect(root.className).toContain('hover:border-accent/50');
  });

  it('renders as a div by default (no href)', () => {
    render(
      <DashboardWidget title="x">
        <span>body</span>
      </DashboardWidget>,
    );
    expect(screen.getByTestId('dashboard-widget').tagName).toBe('DIV');
  });

  const variants: DashboardWidgetVariant[] = [
    'default',
    'raised',
    'accent',
    'positive',
    'warning',
    'attention',
    'danger',
  ];
  for (const v of variants) {
    it(`renders the "${v}" emphasis variant`, () => {
      render(
        <DashboardWidget title={`v-${v}`} variant={v}>
          <span>body</span>
        </DashboardWidget>,
      );
      // Root always carries the rounded-xl border base regardless of variant.
      expect(screen.getByTestId('dashboard-widget').className).toContain(
        'rounded-xl',
      );
      expect(screen.getByText(`v-${v}`)).toBeInTheDocument();
    });
  }
});
