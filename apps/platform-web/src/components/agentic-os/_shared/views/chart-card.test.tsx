/**
 * Wave B.1 — ChartCard render + state + composition tests.
 *
 * Covers: title forwarding to DashboardWidget, loading skeleton, empty
 * state (default EmptyState + inline `false` form), range toggle render
 * + selection (controlled + uncontrolled), extra actions, and that the
 * line/bar/area chart bodies mount.
 *
 * Recharts' `ResponsiveContainer` measures 0x0 in jsdom, so it's mocked
 * to a fixed size — this lets the inner chart actually render its SVG.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BarChart3 } from 'lucide-react';

// Mock ResponsiveContainer to a fixed box so child charts render in jsdom.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 240 }}>{children}</div>
    ),
  };
});

import { ChartCard } from './chart-card';
import type { ChartSeries, ChartRange } from './chart-card';

const series: ChartSeries[] = [
  {
    key: 'revenue',
    label: 'Revenue',
    data: [
      { x: '2026-05-10', y: 1200 },
      { x: '2026-05-11', y: 1450 },
      { x: '2026-05-12', y: 1380 },
    ],
  },
  {
    key: 'cost',
    label: 'Cost',
    data: [
      { x: '2026-05-10', y: 400 },
      { x: '2026-05-11', y: 520 },
      { x: '2026-05-12', y: 480 },
    ],
  },
];

const emptySeries: ChartSeries[] = [
  {
    key: 'revenue',
    label: 'Revenue',
    data: [
      { x: '2026-05-10', y: null },
      { x: '2026-05-11', y: null },
    ],
  },
];

const ranges: ChartRange[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
];

describe('ChartCard — composition + header', () => {
  it('forwards the title to the composed DashboardWidget', () => {
    render(<ChartCard title="Revenue trend" series={series} />);
    expect(screen.getByTestId('chart-card')).toBeInTheDocument();
    expect(screen.getByText('Revenue trend')).toBeInTheDocument();
  });

  it('renders the icon slot through DashboardWidget', () => {
    render(
      <ChartCard
        title="Trend"
        series={series}
        icon={<BarChart3 data-testid="cc-icon" />}
      />,
    );
    expect(screen.getByTestId('cc-icon')).toBeInTheDocument();
  });

  it('renders extra header actions', () => {
    render(
      <ChartCard
        title="Trend"
        series={series}
        actions={<button data-testid="download">Download</button>}
      />,
    );
    expect(screen.getByTestId('download')).toBeInTheDocument();
  });
});

describe('ChartCard — chart bodies', () => {
  it('renders the line chart body by default', () => {
    render(<ChartCard title="Trend" series={series} />);
    expect(screen.getByTestId('chart-card-body-line')).toBeInTheDocument();
  });

  it('renders the bar chart body', () => {
    render(<ChartCard title="Trend" series={series} kind="bar" />);
    expect(screen.getByTestId('chart-card-body-bar')).toBeInTheDocument();
  });

  it('renders the area chart body', () => {
    render(<ChartCard title="Trend" series={series} kind="area" />);
    expect(screen.getByTestId('chart-card-body-area')).toBeInTheDocument();
  });
});

describe('ChartCard — loading + empty states', () => {
  it('renders a shimmer skeleton when loading', () => {
    render(<ChartCard title="Trend" series={series} loading />);
    expect(screen.getByTestId('chart-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('chart-card-body-line')).toBeNull();
  });

  it('renders the EmptyState when every series is empty', () => {
    render(<ChartCard title="Trend" series={emptySeries} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('chart-card-body-line')).toBeNull();
  });

  it('renders the EmptyState when there are no series at all', () => {
    render(<ChartCard title="Trend" series={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('honors a custom empty state config', () => {
    render(
      <ChartCard
        title="Trend"
        series={emptySeries}
        emptyState={{ title: 'No revenue logged yet' }}
      />,
    );
    expect(screen.getByText('No revenue logged yet')).toBeInTheDocument();
  });

  it('renders the inline empty message when emptyState is false', () => {
    render(<ChartCard title="Trend" series={emptySeries} emptyState={false} />);
    expect(screen.getByTestId('chart-card-empty-inline')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('ChartCard — range toggle', () => {
  it('omits the range toggle when no ranges are supplied', () => {
    render(<ChartCard title="Trend" series={series} />);
    expect(screen.queryByTestId('chart-card-range-toggle')).toBeNull();
  });

  it('renders a range toggle and marks the first range active by default', () => {
    render(<ChartCard title="Trend" series={series} ranges={ranges} />);
    expect(screen.getByTestId('chart-card-range-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('chart-card-range-7d')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('fires onRangeChange and updates the active pill (uncontrolled)', () => {
    const onRangeChange = vi.fn();
    render(
      <ChartCard
        title="Trend"
        series={series}
        ranges={ranges}
        onRangeChange={onRangeChange}
      />,
    );
    fireEvent.click(screen.getByTestId('chart-card-range-30d'));
    expect(onRangeChange).toHaveBeenCalledWith('30d');
    expect(screen.getByTestId('chart-card-range-30d')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('respects a controlled activeRange prop', () => {
    const { rerender } = render(
      <ChartCard
        title="Trend"
        series={series}
        ranges={ranges}
        activeRange="90d"
        onRangeChange={() => {}}
      />,
    );
    expect(screen.getByTestId('chart-card-range-90d')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Clicking does not flip the pill — parent controls it.
    fireEvent.click(screen.getByTestId('chart-card-range-7d'));
    expect(screen.getByTestId('chart-card-range-90d')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    rerender(
      <ChartCard
        title="Trend"
        series={series}
        ranges={ranges}
        activeRange="7d"
        onRangeChange={() => {}}
      />,
    );
    expect(screen.getByTestId('chart-card-range-7d')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
