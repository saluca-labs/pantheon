/**
 * Pantheon UI Depth Wave — `CalendarView` shared view primitive (Wave B.3).
 *
 * Month + week grid for entities carrying a date field. Generalizes
 * `creator/editorial-calendar.tsx` (currently Creator-specific). Generic over
 * the event shape via `getEventDate` + `renderEvent`.
 *
 * Date strategy (decision 5.4 — custom, no calendar library):
 * - Grid construction math lives in `CalendarView.utils.ts` and is UTC-only.
 * - `isoWeek()` is imported from `@/lib/agentic-os/creator/calendar` — NOT
 *   reimplemented. The v0.1.58 TZ-leak bug was a shadow `isoWeek`; this
 *   primitive deliberately consumes the canonical one.
 * - Event→cell bucketing uses the UTC `dateKey()` helper so a chip lands on
 *   the same day on any host timezone.
 *
 * Controlled component: the consumer owns `date` + `view` and reacts to
 * `onDateChange` / `onViewChange`. Props in, callbacks out.
 *
 * Design contract: tokens only. Per-OS accent via optional `slug` (today
 * marker ring + event-chip default tint).
 *
 * @license MIT — Tiresias platform (internal).
 */

'use client';

import { useMemo } from 'react';
import clsx from 'clsx';
import { isoWeek } from '@/lib/agentic-os/creator/calendar';
import type { OsSlug } from '@/lib/agentic-os/registry';
import {
  WEEKDAY_LABELS,
  addUtcDays,
  addUtcMonths,
  buildMonthGrid,
  buildWeekGrid,
  dateKey,
  monthLabel,
  weekRangeLabel,
  type CalendarCell,
} from './calendar-view.utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export type CalendarViewMode = 'month' | 'week';

export interface CalendarViewProps<TEvent> {
  /** Events to place on the grid. Order within a day is input order. */
  events: TEvent[];
  /** Current grid mode. Controlled by the consumer. */
  view: CalendarViewMode;
  /** Focused date — the grid renders the month/week containing this date. */
  date: Date;
  /** Extract the event's date. Return `null` to drop the event (unscheduled). */
  getEventDate: (event: TEvent) => Date | null | undefined;
  /** Stable key for an event — used as React key. */
  getEventId: (event: TEvent) => string;
  /** Render a single event chip within a day cell. */
  renderEvent: (event: TEvent) => React.ReactNode;
  /** Fired when navigation (prev / next / today) changes the focused date. */
  onDateChange: (date: Date) => void;
  /** Fired when the month/week toggle changes. Omit to hide the toggle. */
  onViewChange?: (view: CalendarViewMode) => void;
  /** Fired when an empty day cell is activated — an affordance to create. */
  onCreate?: (date: Date) => void;
  /** "Today" reference instant. Defaults to `new Date()`. Inject for tests. */
  today?: Date;
  /** Optional per-OS accent for the today marker + chip default tint. */
  slug?: OsSlug;
  className?: string;
}

// ─── Day cell ───────────────────────────────────────────────────────────────

function DayCell<TEvent>({
  cell,
  events,
  renderEvent,
  getEventId,
  onCreate,
  slug,
  compact,
}: {
  cell: CalendarCell;
  events: TEvent[];
  renderEvent: CalendarViewProps<TEvent>['renderEvent'];
  getEventId: CalendarViewProps<TEvent>['getEventId'];
  onCreate?: CalendarViewProps<TEvent>['onCreate'];
  slug?: OsSlug;
  /** Month grid = compact cells; week grid = taller cells. */
  compact: boolean;
}) {
  return (
    <div
      data-testid={`calendar-cell-${cell.key}`}
      data-today={cell.isToday || undefined}
      data-outside={!cell.inCurrentMonth || undefined}
      className={clsx(
        'flex flex-col gap-1 border border-border-subtle p-1.5 transition',
        compact ? 'min-h-[5.5rem]' : 'min-h-[14rem]',
        cell.inCurrentMonth ? 'bg-surface-1' : 'bg-surface-0',
        cell.isWeekend && cell.inCurrentMonth && 'bg-surface-1/60',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={clsx(
            'inline-flex h-5 min-w-5 items-center justify-center rounded text-xs tabular-nums',
            cell.isToday
              ? slug
                ? `bg-os-${slug}/20 text-os-${slug} font-semibold ring-1 ring-os-${slug}/40`
                : 'bg-accent/20 text-accent font-semibold ring-1 ring-accent/40'
              : cell.inCurrentMonth
                ? 'text-text-secondary'
                : 'text-text-tertiary',
          )}
        >
          {cell.dayOfMonth}
        </span>
        {onCreate && (
          <button
            type="button"
            aria-label={`Add on ${cell.key}`}
            onClick={() => onCreate(cell.date)}
            className="rounded px-1 text-xs leading-none text-text-tertiary opacity-0 transition hover:text-accent focus-visible:opacity-100 group-hover:opacity-100"
          >
            +
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto">
        {events.map((event) => (
          <div key={getEventId(event)} data-testid="calendar-event">
            {renderEvent(event)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CalendarView ───────────────────────────────────────────────────────────

export function CalendarView<TEvent>({
  events,
  view,
  date,
  getEventDate,
  getEventId,
  renderEvent,
  onDateChange,
  onViewChange,
  onCreate,
  today,
  slug,
  className,
}: CalendarViewProps<TEvent>) {
  const todayRef = today ?? new Date();

  const cells = useMemo(
    () =>
      view === 'month'
        ? buildMonthGrid(date, todayRef)
        : buildWeekGrid(date, todayRef),
    // todayRef is intentionally a stable-per-render value; including it keeps
    // the today marker correct if the consumer injects a changing instant.
    [view, date, todayRef],
  );

  /** Bucket events by UTC `dateKey` so chips land timezone-deterministically. */
  const eventsByDay = useMemo(() => {
    const map = new Map<string, TEvent[]>();
    for (const event of events) {
      const d = getEventDate(event);
      if (!d) continue;
      const key = dateKey(d);
      const bucket = map.get(key) ?? [];
      bucket.push(event);
      map.set(key, bucket);
    }
    return map;
  }, [events, getEventDate]);

  const headingLabel =
    view === 'month' ? monthLabel(date) : weekRangeLabel(date);
  const isoWeekLabel = view === 'week' ? isoWeek(date) : null;

  function navigate(direction: -1 | 1) {
    onDateChange(
      view === 'month'
        ? addUtcMonths(date, direction)
        : addUtcDays(date, direction * 7),
    );
  }

  return (
    <div
      data-testid="calendar-view"
      className={clsx('group flex flex-col gap-3', className)}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => navigate(-1)}
            className="rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-sm text-text-secondary transition hover:border-accent hover:text-text-primary"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onDateChange(todayRef)}
            className="rounded-md border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-accent hover:text-text-primary"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => navigate(1)}
            className="rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-sm text-text-secondary transition hover:border-accent hover:text-text-primary"
          >
            ›
          </button>
          <div className="ml-1 flex items-baseline gap-2">
            <h3 className="text-base font-semibold text-text-primary">
              {headingLabel}
            </h3>
            {isoWeekLabel && (
              <span className="font-mono text-2xs uppercase tracking-wide text-text-tertiary">
                {isoWeekLabel}
              </span>
            )}
          </div>
        </div>

        {onViewChange && (
          <div className="flex overflow-hidden rounded-md border border-border-subtle">
            {(['month', 'week'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewChange(mode)}
                className={clsx(
                  'px-3 py-1 text-xs font-medium capitalize transition',
                  view === mode
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-text-secondary hover:text-text-primary',
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-2">
        <div className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="border-b border-border-subtle px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text-tertiary"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => (
            <DayCell
              key={cell.key}
              cell={cell}
              events={eventsByDay.get(cell.key) ?? []}
              renderEvent={renderEvent}
              getEventId={getEventId}
              onCreate={onCreate}
              slug={slug}
              compact={view === 'month'}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default CalendarView;
