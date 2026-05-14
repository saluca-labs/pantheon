/**
 * DashboardHub — declarative dashboard-region + backward-compat tests.
 *
 * Wave C (UI Depth Wave) gave `DashboardHub` a first-class dashboard
 * region: a default-open collapsible above the feature grid, driven by
 * either the declarative `dashboard` spec (widgets / chart / activity) or
 * the raw `dashboardSlot` escape hatch.
 *
 * Coverage:
 *  - backward compat: `module`-only render is structurally unchanged
 *  - `dashboard` with widgets only / chart only / activity only / all three
 *  - `dashboardSlot` precedence over `dashboard`
 *  - neither prop → no dashboard region (no empty collapsible)
 *  - collapsible is default-open
 *
 * Recharts' `ResponsiveContainer` measures 0x0 in jsdom, so it's mocked to
 * a fixed size — mirrors `chart-card.test.tsx` — so the `ChartCard` spec
 * path actually mounts its SVG body.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';

// Mock ResponsiveContainer to a fixed box so the ChartCard spec renders.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 240 }}>{children}</div>
    ),
  };
});

import { DashboardHub } from './dashboard-hub';
import type {
  DashboardWidgetSpec,
  ChartCardSpec,
  ActivityFeedSpec,
} from './dashboard-hub';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import type { AgenticOsModule } from '@/lib/agentic-os/registry';

const businessModule = findAgenticOsModule('business') as AgenticOsModule;
const healthModule = findAgenticOsModule('health') as AgenticOsModule;

const widgetSpecs: DashboardWidgetSpec[] = [
  {
    title: 'Open deals',
    children: <span>$42,000</span>,
  },
  {
    title: 'Unbilled hours',
    children: <span>18.5</span>,
  },
];

const chartSpec: ChartCardSpec = {
  title: 'Revenue trend',
  series: [
    {
      key: 'revenue',
      label: 'Revenue',
      data: [
        { x: '2026-05-10', y: 1200 },
        { x: '2026-05-11', y: 1450 },
      ],
    },
  ],
};

const activitySpec: ActivityFeedSpec = {
  events: [
    {
      id: 'a1',
      occurredAt: new Date().toISOString(),
      actor: 'Alfred',
      summary: 'closed the Acme deal',
      tone: 'positive',
    },
  ],
};

describe('DashboardHub — backward compatibility', () => {
  it('renders no dashboard region when neither dashboard nor dashboardSlot is given', () => {
    render(<DashboardHub module={businessModule} />);
    expect(screen.queryByTestId('dashboard-hub-dashboard-details')).toBeNull();
    expect(screen.queryByTestId('dashboard-hub-region')).toBeNull();
  });

  it('renders the unchanged shell structure with only the module prop', () => {
    const { container } = render(<DashboardHub module={businessModule} />);
    // Header, feature grid, and the "All Agentic OS modules" back-link
    // still render exactly as before — no new wrappers introduced.
    expect(screen.getByText('Business OS')).toBeInTheDocument();
    expect(screen.getByText('All Agentic OS modules')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Features' })).toBeInTheDocument();
    expect(
      screen.getByText(
        `${businessModule.features.length} features available`,
      ),
    ).toBeInTheDocument();
    // The only <details> is the pre-existing roadmap accordion (rendered
    // because `roadmapMarkdown` is `undefined`, which is `!== null` — the
    // unchanged pre-refactor behavior). No dashboard <details> is added.
    expect(container.querySelectorAll('details')).toHaveLength(1);
    expect(screen.getByText('View execution roadmap')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-hub-dashboard-details')).toBeNull();
  });

  it('still renders the roadmap accordion (and only that) when roadmapMarkdown is passed without a dashboard', () => {
    const { container } = render(
      <DashboardHub module={healthModule} roadmapMarkdown="# Roadmap" />,
    );
    // Exactly one <details> — the roadmap — and no dashboard region.
    expect(container.querySelectorAll('details')).toHaveLength(1);
    expect(screen.getByText('View execution roadmap')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-hub-dashboard-details')).toBeNull();
  });

  it('renders the existing flagBanner / consentGate slots unchanged', () => {
    render(
      <DashboardHub
        module={healthModule}
        flagBanner={<div data-testid="flag">flags</div>}
        consentGate={<div data-testid="consent">consent</div>}
      />,
    );
    expect(screen.getByTestId('flag')).toBeInTheDocument();
    expect(screen.getByTestId('consent')).toBeInTheDocument();
    // No dashboard region — flagBanner is not the dashboard region.
    expect(screen.queryByTestId('dashboard-hub-dashboard-details')).toBeNull();
  });
});

describe('DashboardHub — declarative dashboard region', () => {
  it('renders the dashboard region in a default-open collapsible', () => {
    render(
      <DashboardHub
        module={businessModule}
        dashboard={{ widgets: widgetSpecs }}
      />,
    );
    const details = screen.getByTestId('dashboard-hub-dashboard-details');
    expect(details).toBeInTheDocument();
    // `<details open>` — default-open per the spec.
    expect(details).toHaveAttribute('open');
    expect(details.tagName).toBe('DETAILS');
  });

  it('renders the dashboard region above the feature grid', () => {
    const { container } = render(
      <DashboardHub
        module={businessModule}
        dashboard={{ widgets: widgetSpecs }}
      />,
    );
    const region = screen.getByTestId('dashboard-hub-dashboard-details');
    const featuresHeading = screen.getByRole('heading', { name: 'Features' });
    // Document order: dashboard region precedes the Features section.
    expect(
      region.compareDocumentPosition(featuresHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Two <details>: the new dashboard region + the pre-existing roadmap
    // accordion (`roadmapMarkdown` is `undefined`, i.e. `!== null`).
    expect(container.querySelectorAll('details')).toHaveLength(2);
  });

  it('renders a DashboardWidget grid when dashboard.widgets is supplied', () => {
    render(
      <DashboardHub
        module={businessModule}
        dashboard={{ widgets: widgetSpecs }}
      />,
    );
    expect(screen.getByTestId('dashboard-hub-widget-grid')).toBeInTheDocument();
    expect(screen.getAllByTestId('dashboard-widget')).toHaveLength(2);
    expect(screen.getByText('Open deals')).toBeInTheDocument();
    expect(screen.getByText('Unbilled hours')).toBeInTheDocument();
  });

  it('threads module.slug into widgets as the default osSlug accent', () => {
    render(
      <DashboardHub
        module={businessModule}
        dashboard={{
          widgets: [
            { title: 'Tinted', icon: <Activity />, children: <span>x</span> },
          ],
        }}
      />,
    );
    // Business OS → `os-business` accent token on the widget icon tile.
    expect(
      screen.getByTestId('dashboard-widget-icon').className,
    ).toContain('text-os-business');
  });

  it('renders a ChartCard when dashboard.chart is supplied', () => {
    render(
      <DashboardHub module={businessModule} dashboard={{ chart: chartSpec }} />,
    );
    expect(screen.getByTestId('chart-card')).toBeInTheDocument();
    expect(screen.getByText('Revenue trend')).toBeInTheDocument();
    expect(screen.getByTestId('chart-card-body-line')).toBeInTheDocument();
    // No widget grid / activity feed when only the chart spec is given.
    expect(screen.queryByTestId('dashboard-hub-widget-grid')).toBeNull();
    expect(screen.queryByTestId('activity-feed')).toBeNull();
  });

  it('renders an ActivityFeed when dashboard.activity is supplied', () => {
    render(
      <DashboardHub
        module={businessModule}
        dashboard={{ activity: activitySpec }}
      />,
    );
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-a1')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-hub-widget-grid')).toBeNull();
    expect(screen.queryByTestId('chart-card')).toBeNull();
  });

  it('renders all three primitives when widgets + chart + activity are supplied', () => {
    render(
      <DashboardHub
        module={businessModule}
        dashboard={{
          widgets: widgetSpecs,
          chart: chartSpec,
          activity: activitySpec,
        }}
      />,
    );
    expect(screen.getByTestId('dashboard-hub-widget-grid')).toBeInTheDocument();
    expect(screen.getByTestId('chart-card')).toBeInTheDocument();
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
  });

  it('renders no region when dashboard is an empty object', () => {
    render(<DashboardHub module={businessModule} dashboard={{}} />);
    // An empty spec still produces the collapsible (consumer opted in) but
    // the region itself draws no primitives.
    expect(
      screen.getByTestId('dashboard-hub-dashboard-details'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-hub-widget-grid')).toBeNull();
    expect(screen.queryByTestId('chart-card')).toBeNull();
    expect(screen.queryByTestId('activity-feed')).toBeNull();
  });
});

describe('DashboardHub — dashboardSlot escape hatch', () => {
  it('renders dashboardSlot inside the collapsible region', () => {
    render(
      <DashboardHub
        module={businessModule}
        dashboardSlot={<div data-testid="raw-slot">raw composition</div>}
      />,
    );
    const details = screen.getByTestId('dashboard-hub-dashboard-details');
    expect(details).toHaveAttribute('open');
    expect(screen.getByTestId('raw-slot')).toBeInTheDocument();
  });

  it('gives dashboardSlot precedence over the declarative dashboard prop', () => {
    render(
      <DashboardHub
        module={businessModule}
        dashboard={{ widgets: widgetSpecs, chart: chartSpec }}
        dashboardSlot={<div data-testid="raw-slot">raw composition</div>}
      />,
    );
    // Slot wins — the declarative specs are ignored entirely.
    expect(screen.getByTestId('raw-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-hub-region')).toBeNull();
    expect(screen.queryByTestId('dashboard-hub-widget-grid')).toBeNull();
    expect(screen.queryByTestId('chart-card')).toBeNull();
  });
});
