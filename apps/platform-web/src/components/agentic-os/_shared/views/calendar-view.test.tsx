/**
 * Wave B.3 — `CalendarView` unit tests.
 *
 * Coverage:
 *   1. Pure grid math (`CalendarView.utils`): month grid is always 42 cells,
 *      week grid 7, Monday-anchored, today marker correct, addUtcMonths clamps.
 *   2. Renders the month grid with the focused-month label and weekday header.
 *   3. Event chips bucket onto the correct UTC day cell, generic over shape.
 *   4. Month navigation (prev / next / today) fires `onDateChange` with the
 *      right UTC date.
 *   5. Week navigation steps by 7 days and shows the ISO-week label.
 *   6. `onCreate` affordance fires with the cell's date.
 *   7. Empty path: zero events still renders a full grid.
 *
 * TIMEZONE DISCIPLINE: every Date in this file is constructed via `Date.UTC`,
 * and `today` is injected explicitly — never `new Date()`. This is the exact
 * class of bug the v0.1.58 isoWeek TZ-leak fix addressed; the tests must not
 * reintroduce host-timezone sensitivity.
 *
 * @license MIT — Tiresias platform (internal).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CalendarView } from './calendar-view';
import {
  addUtcMonths,
  buildMonthGrid,
  buildWeekGrid,
  dateKey,
  startOfUtcWeek,
} from './calendar-view.utils';

// A fixed UTC reference instant: Wed 2026-05-13.
const TODAY = new Date(Date.UTC(2026, 4, 13));
const FOCUS_MAY = new Date(Date.UTC(2026, 4, 13));

interface Evt {
  uid: string;
  when: string; // ISO
  label: string;
}

describe('CalendarView.utils — pure grid math', () => {
  it('builds a 42-cell month grid', () => {
    const grid = buildMonthGrid(FOCUS_MAY, TODAY);
    expect(grid).toHaveLength(42);
  });

  it('anchors the month grid on a Monday', () => {
    const grid = buildMonthGrid(FOCUS_MAY, TODAY);
    expect(grid[0]!.date.getUTCDay()).toBe(1); // Monday
  });

  it('marks today exactly once in the month grid', () => {
    const grid = buildMonthGrid(FOCUS_MAY, TODAY);
    const todays = grid.filter((c) => c.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0]!.key).toBe('2026-05-13');
  });

  it('flags spill days as outside the current month', () => {
    const grid = buildMonthGrid(FOCUS_MAY, TODAY);
    // May 1 2026 is a Friday, so cells 0-3 (Mon-Thu) are April spill.
    expect(grid[0]!.inCurrentMonth).toBe(false);
    expect(grid[4]!.inCurrentMonth).toBe(true); // May 1
  });

  it('builds a 7-cell Monday-anchored week grid', () => {
    const grid = buildWeekGrid(FOCUS_MAY, TODAY);
    expect(grid).toHaveLength(7);
    expect(grid[0]!.date.getUTCDay()).toBe(1);
    expect(grid[6]!.date.getUTCDay()).toBe(0); // Sunday
  });

  it('startOfUtcWeek snaps a Sunday back to the prior Monday', () => {
    const sunday = new Date(Date.UTC(2026, 4, 17)); // 2026-05-17 is a Sunday
    expect(dateKey(startOfUtcWeek(sunday))).toBe('2026-05-11');
  });

  it('addUtcMonths clamps overflowing days (Jan 31 + 1mo → Feb 28)', () => {
    const jan31 = new Date(Date.UTC(2026, 0, 31));
    expect(dateKey(addUtcMonths(jan31, 1))).toBe('2026-02-28');
  });

  it('addUtcMonths handles negative steps', () => {
    expect(dateKey(addUtcMonths(FOCUS_MAY, -1))).toBe('2026-04-13');
  });
});

describe('CalendarView — month rendering', () => {
  function renderMonth(overrides = {}) {
    const onDateChange = vi.fn();
    const onViewChange = vi.fn();
    const utils = render(
      <CalendarView<Evt>
        events={[]}
        view="month"
        date={FOCUS_MAY}
        today={TODAY}
        getEventDate={(e) => new Date(e.when)}
        getEventId={(e) => e.uid}
        renderEvent={(e) => <span>{e.label}</span>}
        onDateChange={onDateChange}
        onViewChange={onViewChange}
        {...overrides}
      />,
    );
    return { onDateChange, onViewChange, ...utils };
  }

  it('renders the focused-month label', () => {
    renderMonth();
    expect(screen.getByText('May 2026')).toBeInTheDocument();
  });

  it('renders a Monday-first weekday header', () => {
    renderMonth();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('renders all 42 day cells', () => {
    const { container } = renderMonth();
    expect(container.querySelectorAll('[data-testid^="calendar-cell-"]')).toHaveLength(42);
  });

  it('marks the today cell', () => {
    renderMonth();
    expect(screen.getByTestId('calendar-cell-2026-05-13')).toHaveAttribute('data-today', 'true');
  });

  it('renders an empty grid when there are no events', () => {
    renderMonth();
    expect(screen.queryByTestId('calendar-event')).not.toBeInTheDocument();
  });
});

describe('CalendarView — event bucketing', () => {
  it('places an event chip on the matching UTC day cell', () => {
    const events: Evt[] = [
      { uid: 'e1', when: '2026-05-13T09:00:00Z', label: 'Launch' },
      { uid: 'e2', when: '2026-05-20T00:00:00Z', label: 'Review' },
    ];
    render(
      <CalendarView<Evt>
        events={events}
        view="month"
        date={FOCUS_MAY}
        today={TODAY}
        getEventDate={(e) => new Date(e.when)}
        getEventId={(e) => e.uid}
        renderEvent={(e) => <span>{e.label}</span>}
        onDateChange={vi.fn()}
      />,
    );
    expect(within(screen.getByTestId('calendar-cell-2026-05-13')).getByText('Launch')).toBeInTheDocument();
    expect(within(screen.getByTestId('calendar-cell-2026-05-20')).getByText('Review')).toBeInTheDocument();
  });

  it('drops events whose date resolves to null (unscheduled)', () => {
    const events: Evt[] = [{ uid: 'e1', when: '', label: 'Floating' }];
    render(
      <CalendarView<Evt>
        events={events}
        view="month"
        date={FOCUS_MAY}
        today={TODAY}
        getEventDate={() => null}
        getEventId={(e) => e.uid}
        renderEvent={(e) => <span>{e.label}</span>}
        onDateChange={vi.fn()}
      />,
    );
    expect(screen.queryByText('Floating')).not.toBeInTheDocument();
  });
});

describe('CalendarView — month navigation', () => {
  function renderMonth() {
    const onDateChange = vi.fn();
    render(
      <CalendarView<Evt>
        events={[]}
        view="month"
        date={FOCUS_MAY}
        today={TODAY}
        getEventDate={(e) => new Date(e.when)}
        getEventId={(e) => e.uid}
        renderEvent={(e) => <span>{e.label}</span>}
        onDateChange={onDateChange}
      />,
    );
    return { onDateChange };
  }

  it('Next advances one UTC month', () => {
    const { onDateChange } = renderMonth();
    fireEvent.click(screen.getByLabelText('Next'));
    expect(dateKey(onDateChange.mock.calls[0]![0])).toBe('2026-06-13');
  });

  it('Previous retreats one UTC month', () => {
    const { onDateChange } = renderMonth();
    fireEvent.click(screen.getByLabelText('Previous'));
    expect(dateKey(onDateChange.mock.calls[0]![0])).toBe('2026-04-13');
  });

  it('Today resets to the injected today reference', () => {
    const { onDateChange } = renderMonth();
    fireEvent.click(screen.getByText('Today'));
    expect(onDateChange.mock.calls[0]![0]).toBe(TODAY);
  });
});

describe('CalendarView — week navigation', () => {
  function renderWeek() {
    const onDateChange = vi.fn();
    render(
      <CalendarView<Evt>
        events={[]}
        view="week"
        date={FOCUS_MAY}
        today={TODAY}
        getEventDate={(e) => new Date(e.when)}
        getEventId={(e) => e.uid}
        renderEvent={(e) => <span>{e.label}</span>}
        onDateChange={onDateChange}
      />,
    );
    return { onDateChange };
  }

  it('renders only 7 cells in week view', () => {
    renderWeek();
    expect(document.querySelectorAll('[data-testid^="calendar-cell-"]')).toHaveLength(7);
  });

  it('shows the ISO-week label in week view', () => {
    renderWeek();
    // 2026-05-13 falls in ISO week 2026-W20.
    expect(screen.getByText('2026-W20')).toBeInTheDocument();
  });

  it('Next advances exactly 7 UTC days', () => {
    const { onDateChange } = renderWeek();
    fireEvent.click(screen.getByLabelText('Next'));
    expect(dateKey(onDateChange.mock.calls[0]![0])).toBe('2026-05-20');
  });

  it('Previous retreats exactly 7 UTC days', () => {
    const { onDateChange } = renderWeek();
    fireEvent.click(screen.getByLabelText('Previous'));
    expect(dateKey(onDateChange.mock.calls[0]![0])).toBe('2026-05-06');
  });
});

describe('CalendarView — create affordance', () => {
  it('fires onCreate with the cell date when the + affordance is clicked', () => {
    const onCreate = vi.fn();
    render(
      <CalendarView<Evt>
        events={[]}
        view="month"
        date={FOCUS_MAY}
        today={TODAY}
        getEventDate={(e) => new Date(e.when)}
        getEventId={(e) => e.uid}
        renderEvent={(e) => <span>{e.label}</span>}
        onDateChange={vi.fn()}
        onCreate={onCreate}
      />,
    );
    fireEvent.click(screen.getByLabelText('Add on 2026-05-13'));
    expect(dateKey(onCreate.mock.calls[0]![0])).toBe('2026-05-13');
  });

  it('hides the view toggle when onViewChange is omitted', () => {
    render(
      <CalendarView<Evt>
        events={[]}
        view="month"
        date={FOCUS_MAY}
        today={TODAY}
        getEventDate={(e) => new Date(e.when)}
        getEventId={(e) => e.uid}
        renderEvent={(e) => <span>{e.label}</span>}
        onDateChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /^month$/i })).not.toBeInTheDocument();
  });
});
