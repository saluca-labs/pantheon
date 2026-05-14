/**
 * Wave B.3 — `TimelineView` unit tests.
 *
 * Coverage:
 *   1. Pure geometry (`computeGeometry`): offset/width percentages, span vs
 *      milestone classification, clamping at range edges, out-of-range drop.
 *   2. Span items render as bars with a positive width; milestones render as
 *      zero-width points.
 *   3. Items are placed into the correct lane; lane-less mode uses one track.
 *   4. Out-of-range items are dropped from the render.
 *   5. Empty path renders the empty label.
 *   6. `onItemClick` fires on click and on Enter (keyboard).
 *   7. Orientation prop is reflected.
 *
 * TIMEZONE DISCIPLINE: every Date built via `Date.UTC`; geometry is computed
 * from `.getTime()` epoch millis, so these assertions are host-TZ-invariant.
 *
 * @license MIT — Tiresias platform (internal).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  TimelineView,
  computeGeometry,
  defaultTimelineItem,
  type TimelineItemBase,
  type TimelineLane,
  type TimelineRange,
} from './timeline-view';

// A clean 100-day window so percentages are easy to reason about.
const RANGE: TimelineRange = {
  start: new Date(Date.UTC(2026, 0, 1)), // 2026-01-01
  end: new Date(Date.UTC(2026, 3, 11)), // 2026-01-01 + 100 days
};

interface Phase extends TimelineItemBase {
  name: string;
}

describe('TimelineView — computeGeometry', () => {
  it('positions a span by offset + width percentage', () => {
    // Starts at day 10, ends at day 30 → offset 10%, width 20%.
    const geo = computeGeometry(
      {
        id: 's1',
        start: new Date(Date.UTC(2026, 0, 11)),
        end: new Date(Date.UTC(2026, 0, 31)),
      },
      RANGE,
    );
    expect(geo).not.toBeNull();
    expect(geo!.isSpan).toBe(true);
    expect(geo!.offsetPct).toBeCloseTo(10, 5);
    expect(geo!.widthPct).toBeCloseTo(20, 5);
    expect(geo!.clamped).toBe(false);
  });

  it('classifies an end-less item as a milestone with zero width', () => {
    const geo = computeGeometry(
      { id: 'm1', start: new Date(Date.UTC(2026, 0, 51)) },
      RANGE,
    );
    expect(geo!.isSpan).toBe(false);
    expect(geo!.widthPct).toBe(0);
    expect(geo!.offsetPct).toBeCloseTo(50, 5);
  });

  it('clamps a span that overruns the range edge', () => {
    const geo = computeGeometry(
      {
        id: 's2',
        start: new Date(Date.UTC(2025, 11, 1)), // before range start
        end: new Date(Date.UTC(2026, 0, 21)), // day 20 inside range
      },
      RANGE,
    );
    expect(geo!.clamped).toBe(true);
    expect(geo!.offsetPct).toBe(0);
    expect(geo!.widthPct).toBeCloseTo(20, 5);
  });

  it('returns null for an item entirely outside the range', () => {
    const geo = computeGeometry(
      {
        id: 's3',
        start: new Date(Date.UTC(2027, 0, 1)),
        end: new Date(Date.UTC(2027, 1, 1)),
      },
      RANGE,
    );
    expect(geo).toBeNull();
  });

  it('returns null for a zero/negative range', () => {
    const geo = computeGeometry(
      { id: 's4', start: RANGE.start },
      { start: RANGE.end, end: RANGE.start },
    );
    expect(geo).toBeNull();
  });
});

describe('TimelineView — rendering', () => {
  const ITEMS: Phase[] = [
    {
      id: 'p1',
      name: 'Discovery',
      start: new Date(Date.UTC(2026, 0, 11)),
      end: new Date(Date.UTC(2026, 0, 31)),
    },
    {
      id: 'p2',
      name: 'Build',
      start: new Date(Date.UTC(2026, 1, 1)),
      end: new Date(Date.UTC(2026, 2, 1)),
    },
    {
      id: 'm1',
      name: 'Launch',
      start: new Date(Date.UTC(2026, 2, 15)),
    },
  ];

  function renderTimeline(overrides = {}) {
    return render(
      <TimelineView<Phase>
        items={ITEMS}
        range={RANGE}
        renderItem={(item, geo) => defaultTimelineItem(item.name, geo)}
        {...overrides}
      />,
    );
  }

  it('renders the timeline container', () => {
    renderTimeline();
    expect(screen.getByTestId('timeline-view')).toBeInTheDocument();
  });

  it('renders spans as span-kind items', () => {
    renderTimeline();
    expect(screen.getByTestId('timeline-item-p1')).toHaveAttribute('data-kind', 'span');
    expect(screen.getByTestId('timeline-item-p2')).toHaveAttribute('data-kind', 'span');
  });

  it('renders an end-less item as a milestone-kind item', () => {
    renderTimeline();
    expect(screen.getByTestId('timeline-item-m1')).toHaveAttribute('data-kind', 'milestone');
  });

  it('positions a span with a non-zero width style', () => {
    renderTimeline();
    const span = screen.getByTestId('timeline-item-p1');
    expect(span.style.width).toMatch(/%$/);
    expect(parseFloat(span.style.width)).toBeGreaterThan(0);
  });

  it('drops items that fall entirely outside the range', () => {
    const outItems: Phase[] = [
      {
        id: 'far',
        name: 'Future',
        start: new Date(Date.UTC(2030, 0, 1)),
        end: new Date(Date.UTC(2030, 1, 1)),
      },
    ];
    renderTimeline({ items: outItems });
    expect(screen.queryByTestId('timeline-item-far')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-view')).toHaveTextContent(/nothing scheduled/i);
  });

  it('renders the empty label when there are no items', () => {
    renderTimeline({ items: [], emptyLabel: 'No phases planned.' });
    expect(screen.getByText('No phases planned.')).toBeInTheDocument();
  });

  it('reflects the orientation prop', () => {
    renderTimeline({ orientation: 'vertical' });
    expect(screen.getByTestId('timeline-view')).toHaveAttribute('data-orientation', 'vertical');
  });
});

describe('TimelineView — lanes', () => {
  const LANES: TimelineLane[] = [
    { id: 'team-a', label: 'Team A' },
    { id: 'team-b', label: 'Team B' },
  ];
  const LANE_ITEMS: Phase[] = [
    {
      id: 'a1',
      name: 'A work',
      laneId: 'team-a',
      start: new Date(Date.UTC(2026, 0, 11)),
      end: new Date(Date.UTC(2026, 0, 21)),
    },
    {
      id: 'b1',
      name: 'B work',
      laneId: 'team-b',
      start: new Date(Date.UTC(2026, 0, 21)),
      end: new Date(Date.UTC(2026, 1, 1)),
    },
  ];

  it('renders each declared lane', () => {
    render(
      <TimelineView<Phase>
        items={LANE_ITEMS}
        range={RANGE}
        lanes={LANES}
        renderItem={(item, geo) => defaultTimelineItem(item.name, geo)}
      />,
    );
    expect(screen.getByTestId('timeline-lane-team-a')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-lane-team-b')).toBeInTheDocument();
    expect(screen.getByText('Team A')).toBeInTheDocument();
  });

  it('places an item into its declared lane', () => {
    render(
      <TimelineView<Phase>
        items={LANE_ITEMS}
        range={RANGE}
        lanes={LANES}
        renderItem={(item, geo) => defaultTimelineItem(item.name, geo)}
      />,
    );
    const laneA = screen.getByTestId('timeline-lane-team-a');
    expect(laneA).toContainElement(screen.getByTestId('timeline-item-a1'));
    const laneB = screen.getByTestId('timeline-lane-team-b');
    expect(laneB).toContainElement(screen.getByTestId('timeline-item-b1'));
  });

  it('falls back to a single anonymous lane when no lanes are given', () => {
    render(
      <TimelineView<Phase>
        items={LANE_ITEMS}
        range={RANGE}
        renderItem={(item, geo) => defaultTimelineItem(item.name, geo)}
      />,
    );
    expect(screen.getByTestId('timeline-lane-__all__')).toBeInTheDocument();
  });
});

describe('TimelineView — interaction', () => {
  const ITEMS: Phase[] = [
    {
      id: 'p1',
      name: 'Discovery',
      start: new Date(Date.UTC(2026, 0, 11)),
      end: new Date(Date.UTC(2026, 0, 31)),
    },
  ];

  it('fires onItemClick when an item is clicked', () => {
    const onItemClick = vi.fn();
    render(
      <TimelineView<Phase>
        items={ITEMS}
        range={RANGE}
        renderItem={(item, geo) => defaultTimelineItem(item.name, geo)}
        onItemClick={onItemClick}
      />,
    );
    fireEvent.click(screen.getByTestId('timeline-item-p1'));
    expect(onItemClick).toHaveBeenCalledWith(ITEMS[0]);
  });

  it('fires onItemClick on Enter for keyboard users', () => {
    const onItemClick = vi.fn();
    render(
      <TimelineView<Phase>
        items={ITEMS}
        range={RANGE}
        renderItem={(item, geo) => defaultTimelineItem(item.name, geo)}
        onItemClick={onItemClick}
      />,
    );
    fireEvent.keyDown(screen.getByTestId('timeline-item-p1'), { key: 'Enter' });
    expect(onItemClick).toHaveBeenCalledWith(ITEMS[0]);
  });

  it('does not make items interactive when onItemClick is omitted', () => {
    render(
      <TimelineView<Phase>
        items={ITEMS}
        range={RANGE}
        renderItem={(item, geo) => defaultTimelineItem(item.name, geo)}
      />,
    );
    expect(screen.getByTestId('timeline-item-p1')).not.toHaveAttribute('role', 'button');
  });
});
