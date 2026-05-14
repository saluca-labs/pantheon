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
 * Slot-grid mode (W-E.1b) — additive layout variant:
 *   8. Renders a slot-row × day-of-week matrix: one row per slot def, 7
 *      day columns relative to `weekStart`.
 *   9. Items bucket into the correct (slot, day) cell and sort by `position`.
 *  10. Move-up / move-down arrows fire `onReorder` with the right payload and
 *      are disabled at the cell edges.
 *  11. The optional per-item action button fires `onAction` with the item.
 *  12. `onCreate` fires with { slotKey, dayOfWeek }; the today column is marked.
 *  13. The default `date-grid` layout is unaffected when `layout` is omitted.
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

  it('reports the date-grid layout via data-layout when layout is omitted', () => {
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
    expect(screen.getByTestId('calendar-view')).toHaveAttribute(
      'data-layout',
      'date-grid',
    );
  });
});

// ─── slot-grid mode (W-E.1b) ────────────────────────────────────────────────

interface PlanItem {
  pid: string;
  slot: string; // slot key
  dow: number; // 0-6, weekStart-relative
  pos: number; // position within the (slot, day) cell
  name: string;
}

// weekStart deliberately given as a mid-week date — the component snaps it to
// the prior UTC Monday (2026-05-11).
const WEEK_START = new Date(Date.UTC(2026, 4, 13)); // Wed 2026-05-13
const SLOT_DEFS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
];

function renderSlotGrid(overrides: Record<string, unknown> = {}) {
  const onReorder = vi.fn();
  const onCreate = vi.fn();
  const onWeekChange = vi.fn();
  const items: PlanItem[] = [
    { pid: 'i1', slot: 'breakfast', dow: 0, pos: 0, name: 'Oatmeal' },
    { pid: 'i2', slot: 'breakfast', dow: 0, pos: 1, name: 'Coffee' },
    { pid: 'i3', slot: 'dinner', dow: 2, pos: 0, name: 'Salmon' },
  ];
  const utils = render(
    <CalendarView<PlanItem>
      layout="slot-grid"
      slots={SLOT_DEFS}
      items={items}
      weekStart={WEEK_START}
      today={TODAY}
      getItemId={(i) => i.pid}
      getItemSlot={(i) => i.slot}
      getItemDayOfWeek={(i) => i.dow}
      getItemPosition={(i) => i.pos}
      renderItem={(i) => <span>{i.name}</span>}
      onReorder={onReorder}
      onCreate={onCreate}
      onWeekChange={onWeekChange}
      {...overrides}
    />,
  );
  return { onReorder, onCreate, onWeekChange, items, ...utils };
}

describe('CalendarView — slot-grid: matrix rendering', () => {
  it('reports the slot-grid layout via data-layout', () => {
    renderSlotGrid();
    expect(screen.getByTestId('calendar-view')).toHaveAttribute(
      'data-layout',
      'slot-grid',
    );
  });

  it('renders one row per slot definition', () => {
    renderSlotGrid();
    for (const def of SLOT_DEFS) {
      expect(
        screen.getByTestId(`calendar-slot-row-${def.key}`),
      ).toBeInTheDocument();
    }
    expect(screen.getByText('Breakfast')).toBeInTheDocument();
    expect(screen.getByText('Dinner')).toBeInTheDocument();
  });

  it('renders 7 weekday columns relative to weekStart', () => {
    const { container } = renderSlotGrid();
    expect(
      container.querySelectorAll('[data-testid^="calendar-slot-col-"]'),
    ).toHaveLength(7);
    // weekStart snaps to Mon 2026-05-11 → first column header shows "May 11".
    expect(screen.getByText('May 11')).toBeInTheDocument();
    expect(screen.getByText('May 17')).toBeInTheDocument();
  });

  it('renders a cell for every (slot, day) intersection', () => {
    const { container } = renderSlotGrid();
    // 3 slots × 7 days.
    expect(
      container.querySelectorAll('[data-testid^="calendar-slot-cell-"]'),
    ).toHaveLength(21);
  });

  it('marks the today column (TODAY = Wed 2026-05-13 = dow 2)', () => {
    renderSlotGrid();
    expect(screen.getByTestId('calendar-slot-col-2')).toHaveAttribute(
      'data-today',
      'true',
    );
    expect(screen.getByTestId('calendar-slot-col-0')).not.toHaveAttribute(
      'data-today',
    );
  });
});

describe('CalendarView — slot-grid: item bucketing', () => {
  it('places items into their (slot, day) cell, position-sorted', () => {
    renderSlotGrid();
    const breakfastMon = screen.getByTestId('calendar-slot-cell-breakfast-0');
    expect(within(breakfastMon).getByText('Oatmeal')).toBeInTheDocument();
    expect(within(breakfastMon).getByText('Coffee')).toBeInTheDocument();
    // pos 0 (Oatmeal) renders before pos 1 (Coffee).
    const itemEls = within(breakfastMon).getAllByTestId(
      /^calendar-slot-item-/,
    );
    expect(itemEls[0]!).toHaveTextContent('Oatmeal');
    expect(itemEls[1]!).toHaveTextContent('Coffee');
  });

  it('sorts by position even when input order is reversed', () => {
    const items: PlanItem[] = [
      { pid: 'b', slot: 'lunch', dow: 1, pos: 2, name: 'Second' },
      { pid: 'a', slot: 'lunch', dow: 1, pos: 1, name: 'First' },
    ];
    renderSlotGrid({ items });
    const cell = screen.getByTestId('calendar-slot-cell-lunch-1');
    const itemEls = within(cell).getAllByTestId(/^calendar-slot-item-/);
    expect(itemEls[0]!).toHaveTextContent('First');
    expect(itemEls[1]!).toHaveTextContent('Second');
  });

  it('leaves empty cells empty', () => {
    renderSlotGrid();
    const emptyCell = screen.getByTestId('calendar-slot-cell-lunch-5');
    expect(
      within(emptyCell).queryByTestId(/^calendar-slot-item-/),
    ).not.toBeInTheDocument();
  });
});

describe('CalendarView — slot-grid: intra-cell reorder', () => {
  it('fires onReorder with the up payload for a non-top item', () => {
    const { onReorder } = renderSlotGrid();
    // i2 (Coffee) is at position 1 — it can move up.
    const coffee = screen.getByTestId('calendar-slot-item-i2');
    fireEvent.click(within(coffee).getByLabelText('Move up'));
    expect(onReorder).toHaveBeenCalledWith({
      itemId: 'i2',
      slotKey: 'breakfast',
      dayOfWeek: 0,
      direction: 'up',
    });
  });

  it('fires onReorder with the down payload for a non-bottom item', () => {
    const { onReorder } = renderSlotGrid();
    // i1 (Oatmeal) is at position 0 — it can move down.
    const oatmeal = screen.getByTestId('calendar-slot-item-i1');
    fireEvent.click(within(oatmeal).getByLabelText('Move down'));
    expect(onReorder).toHaveBeenCalledWith({
      itemId: 'i1',
      slotKey: 'breakfast',
      dayOfWeek: 0,
      direction: 'down',
    });
  });

  it('disables Move-up on the first item and Move-down on the last', () => {
    renderSlotGrid();
    const oatmeal = screen.getByTestId('calendar-slot-item-i1'); // pos 0
    const coffee = screen.getByTestId('calendar-slot-item-i2'); // pos 1 (last)
    expect(within(oatmeal).getByLabelText('Move up')).toBeDisabled();
    expect(within(oatmeal).getByLabelText('Move down')).not.toBeDisabled();
    expect(within(coffee).getByLabelText('Move up')).not.toBeDisabled();
    expect(within(coffee).getByLabelText('Move down')).toBeDisabled();
  });

  it('disables both arrows for a lone item in a cell', () => {
    renderSlotGrid();
    const salmon = screen.getByTestId('calendar-slot-item-i3');
    expect(within(salmon).getByLabelText('Move up')).toBeDisabled();
    expect(within(salmon).getByLabelText('Move down')).toBeDisabled();
  });
});

describe('CalendarView — slot-grid: per-item action', () => {
  it('renders the action button and fires onAction with the item', () => {
    const onAction = vi.fn();
    renderSlotGrid({
      itemAction: {
        label: 'Log',
        ariaLabel: (i: PlanItem) => `Log ${i.name}`,
        onAction,
      },
    });
    fireEvent.click(screen.getByLabelText('Log Oatmeal'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]![0]).toMatchObject({ pid: 'i1' });
  });

  it('renders no action button when itemAction is omitted', () => {
    renderSlotGrid();
    expect(screen.queryByLabelText(/^Log /)).not.toBeInTheDocument();
  });

  it('disables the action button when isEnabled returns false', () => {
    const onAction = vi.fn();
    renderSlotGrid({
      itemAction: {
        label: 'Log',
        ariaLabel: (i: PlanItem) => `Log ${i.name}`,
        onAction,
        isEnabled: (i: PlanItem) => i.pid !== 'i1',
      },
    });
    expect(screen.getByLabelText('Log Oatmeal')).toBeDisabled();
    expect(screen.getByLabelText('Log Coffee')).not.toBeDisabled();
  });
});

describe('CalendarView — slot-grid: create + navigation', () => {
  it('fires onCreate with the slot key and day-of-week', () => {
    const { onCreate } = renderSlotGrid();
    fireEvent.click(screen.getByLabelText('Add to dinner on day 4'));
    expect(onCreate).toHaveBeenCalledWith({ slotKey: 'dinner', dayOfWeek: 4 });
  });

  it('steps the week by 7 UTC days via the nav arrows', () => {
    const { onWeekChange } = renderSlotGrid();
    fireEvent.click(screen.getByLabelText('Next'));
    // weekStart snapped to Mon 2026-05-11; +7 → 2026-05-18.
    expect(dateKey(onWeekChange.mock.calls[0]![0])).toBe('2026-05-18');
    onWeekChange.mockClear();
    fireEvent.click(screen.getByLabelText('Previous'));
    expect(dateKey(onWeekChange.mock.calls[0]![0])).toBe('2026-05-04');
  });

  it('hides week navigation when onWeekChange is omitted', () => {
    renderSlotGrid({ onWeekChange: undefined });
    expect(screen.queryByLabelText('Next')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Previous')).not.toBeInTheDocument();
  });
});
