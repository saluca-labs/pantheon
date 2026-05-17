/**
 * Secure-Dev OS — Wave C-4b (UI Depth Wave) primitive-adoption tests.
 *
 * Secure-Dev had no component-level render tests before Wave C-4b — the prior
 * suite (`stride.test.ts`) is pure-logic only. These tests lock the new
 * explicit hub page's presentation layer:
 *  - buildSecureDevDashboardSpec  → DashboardWidget specs + ActivityFeed spec
 *  - buildSecureDevActivityEvents → recent-threat-model events
 *  - DashboardHub + secure-dev module + spec → the tier-1→tier-2 convergence:
 *    same metadata header + feature grid + roadmap accordion the inline
 *    `[slug]/page.tsx` produced, plus the declarative dashboard region.
 *
 * They assert the primitive structure renders AND that the same domain data
 * still surfaces (model counts, triggered-threat counts, system names), so
 * the "behavior-preserving" contract is verifiable.
 *
 * @license MIT — Tiresias Secure-Dev OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  buildSecureDevDashboardSpec,
  buildSecureDevActivityEvents,
} from '@/lib/agentic-os/secure-dev/dashboard-spec';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import type { EmptyStateProps } from '@/components/agentic-os/_shared/views';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { generateStrideChecklist } from '@/lib/agentic-os/secure-dev/stride';
import type { ThreatModelRow } from '@/lib/agentic-os/secure-dev/repo';

// ─── Fixtures ───────────────────────────────────────────────────────────────

/**
 * Build a saved threat-model row. `description` is fed through the real
 * `generateStrideChecklist` so the `triggered` flags are realistic — callers
 * tune which STRIDE categories fire by choosing keyword-rich descriptions.
 */
function mkModel(overrides: Partial<ThreatModelRow> = {}): ThreatModelRow {
  const description =
    overrides.systemDescription ??
    'A REST API with JWT auth, a PostgreSQL database storing PII, a public ' +
      'file upload endpoint, and an admin role with elevated permissions.';
  return {
    id: 'tm-1',
    userId: 'u-1',
    systemName: 'Patient portal API',
    systemDescription: description,
    checklist: generateStrideChecklist(description),
    createdAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

/** A description that triggers no STRIDE keyword categories. */
const INERT_DESCRIPTION = 'A static brochure page rendered from markdown.';

// ─── buildSecureDevDashboardSpec — the hub `dashboard` prop adapter ──────────

describe('buildSecureDevDashboardSpec — hub dashboard spec', () => {
  it('builds three aggregate-stat widgets, each linking to the threat-model surface', () => {
    const spec = buildSecureDevDashboardSpec({ models: [mkModel()] });
    expect(spec.widgets).toHaveLength(3);
    const testIds = spec.widgets!.map((w) => w['data-testid']);
    expect(testIds).toContain('secure-dev-widget-threat-models');
    expect(testIds).toContain('secure-dev-widget-high-threats');
    expect(testIds).toContain('secure-dev-widget-latest-model');
    for (const w of spec.widgets!) {
      expect(w.href).toBe('/dashboard/os/secure-dev/threat-model');
    }
  });

  it('omits the chart — Secure-Dev has no time-series surface yet', () => {
    const spec = buildSecureDevDashboardSpec({ models: [mkModel()] });
    expect(spec.chart).toBeUndefined();
  });

  it('danger-tints the high-severity widget when any model triggers a high threat', () => {
    const spec = buildSecureDevDashboardSpec({ models: [mkModel()] });
    const high = spec.widgets!.find(
      (w) => w['data-testid'] === 'secure-dev-widget-high-threats',
    );
    expect(high!.variant).toBe('danger');
  });

  it('leaves the high-severity widget default-tinted when nothing triggers', () => {
    const spec = buildSecureDevDashboardSpec({
      models: [
        mkModel({ id: 'inert', systemDescription: INERT_DESCRIPTION }),
      ],
    });
    const high = spec.widgets!.find(
      (w) => w['data-testid'] === 'secure-dev-widget-high-threats',
    );
    expect(high!.variant).toBe('default');
  });

  it('handles the empty (early-stage) case — widgets render, activity has a CTA empty state', () => {
    const spec = buildSecureDevDashboardSpec({ models: [] });
    expect(spec.widgets).toHaveLength(3);
    expect(spec.activity!.events).toHaveLength(0);
    // empty-state offers a "door" CTA into the threat-model surface
    const emptyState = spec.activity!.emptyState as
      | Partial<EmptyStateProps>
      | undefined;
    expect(emptyState).toMatchObject({ title: 'No threat models yet' });
    expect(emptyState?.primaryCta?.href).toBe(
      '/dashboard/os/secure-dev/threat-model',
    );
  });
});

// ─── buildSecureDevActivityEvents — recent-threat-model feed ─────────────────

describe('buildSecureDevActivityEvents — recent threat models', () => {
  it('maps each model into a feed event linking to the threat-model surface', () => {
    const events = buildSecureDevActivityEvents([
      mkModel({ id: 'm-1', systemName: 'Billing service' }),
      mkModel({ id: 'm-2', systemName: 'Marketing site' }),
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: 'm-1',
      actor: 'Billing service',
      href: '/dashboard/os/secure-dev/threat-model',
    });
  });

  it('tones the event by the worst triggered severity (danger for high)', () => {
    const events = buildSecureDevActivityEvents([mkModel({ id: 'hot' })]);
    expect(events[0]!.tone).toBe('danger');
  });

  it('falls back to a neutral tone when a model triggers nothing', () => {
    const events = buildSecureDevActivityEvents([
      mkModel({ id: 'inert', systemDescription: INERT_DESCRIPTION }),
    ]);
    expect(events[0]!.tone).toBe('neutral');
    expect(events[0]!.summary).toBe('no threats triggered');
  });

  it('caps the feed at the most recent 8 models', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      mkModel({ id: `m-${i}` }),
    );
    expect(buildSecureDevActivityEvents(many)).toHaveLength(8);
  });
});

// ─── DashboardHub + secure-dev module — tier-1 → tier-2 convergence ──────────

describe('Secure-Dev hub — DashboardHub convergence (behavior-preserving)', () => {
  const mod = findAgenticOsModule('secure-dev')!;

  it('renders the same metadata header the inline [slug] route produced', () => {
    render(<DashboardHub module={mod} />);
    expect(
      screen.getByRole('heading', { name: 'Secure Dev OS', level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Threat-modeled DevSecOps from day one.'),
    ).toBeInTheDocument();
    // status badge — secure-dev is 'live' in the registry
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders the registry feature grid — the STRIDE threat-model card', () => {
    render(<DashboardHub module={mod} />);
    expect(
      screen.getByRole('heading', { name: 'Features', level: 2 }),
    ).toBeInTheDocument();
    const card = screen.getByRole('link', { name: /STRIDE threat model/ });
    expect(card).toHaveAttribute(
      'href',
      '/dashboard/os/secure-dev/threat-model',
    );
    expect(screen.getByText('1 feature available')).toBeInTheDocument();
  });

  it('renders the declarative dashboard region with the three widgets', () => {
    const dashboard = buildSecureDevDashboardSpec({
      models: [mkModel({ systemName: 'Patient portal API' })],
    });
    render(
      <DashboardHub module={mod} dashboard={dashboard} />,
    );
    expect(screen.getByTestId('dashboard-hub-region')).toBeInTheDocument();
    expect(
      screen.getByTestId('secure-dev-widget-threat-models'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('secure-dev-widget-high-threats'),
    ).toBeInTheDocument();
    // the latest-model widget surfaces the system name in its body
    const latest = screen.getByTestId('secure-dev-widget-latest-model');
    expect(latest).toHaveTextContent('Patient portal API');
  });

  it('renders no dashboard region when the dashboard prop is omitted', () => {
    render(<DashboardHub module={mod} />);
    expect(screen.queryByTestId('dashboard-hub-region')).not.toBeInTheDocument();
  });

  it('surfaces the recent-models ActivityFeed inside the dashboard region', () => {
    const dashboard = buildSecureDevDashboardSpec({
      models: [
        mkModel({ id: 'm-1', systemName: 'Billing service' }),
        mkModel({ id: 'm-2', systemName: 'Marketing site' }),
      ],
    });
    render(
      <DashboardHub module={mod} dashboard={dashboard} />,
    );
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-m-1')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-m-2')).toBeInTheDocument();
  });
});
