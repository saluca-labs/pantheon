/**
 * Pantheon UI Depth Wave — `CalendarView` shared view primitive (Wave B.3,
 * extended W-E.1b).
 *
 * Two layout modes, both controlled, props-in / callbacks-out:
 *
 * 1. `date-grid` (default, Wave B.3) — month + week grid for entities carrying
 *    a date field. Generalizes `creator/editorial-calendar.tsx`. One flat
 *    `events[]` bucket per UTC `dateKey`. Generic over the event shape via
 *    `getEventDate` + `renderEvent`.
 *
 * 2. `slot-grid` (W-E.1b) — a fixed **slot-row × day-of-week matrix**. Rows are
 *    caller-named slots (e.g. breakfast / lunch / dinner, or workout slots),
 *    columns are the 7 weekdays *relative to a `weekStart` prop* (NOT absolute
 *    UTC dates), items within a (slot, day) cell are `position`-ordered with
 *    move-up / move-down reorder, and each item can carry a per-slot action
 *    button. Generalizes `health/nutrition/meal-plan-calendar.tsx` and
 *    `health/activity/activity-plan-calendar.tsx`.
 *
 * The `slot-grid` mode is purely **additive** — `date-grid` props, behavior,
 * and existing call sites are 100% unchanged. The mode is selected by the
 * `layout` prop (default `'date-grid'`); each mode's props are a discriminated
 * union keyed on `layout` so the compiler enforces the right shape.
 *
 * Date strategy (decision 5.4 — custom, no calendar library):
 * - Grid construction math lives in `CalendarView.utils.ts` and is UTC-only.
 * - `isoWeek()` is imported from `@/lib/agentic-os/creator/calendar` — NOT
 *   reimplemented. The v0.1.58 TZ-leak bug was a shadow `isoWeek`; this
 *   primitive deliberately consumes the canonical one.
 * - `date-grid` event→cell bucketing uses the UTC `dateKey()` helper so a chip
 *   lands on the same day on any host timezone.
 * - `slot-grid` columns are weekStart-relative day-of-week indices (0-6,
 *   Monday-first), matching how the Health plan surfaces model their data; the
 *   per-column date is derived via `addUtcDays(weekStart, dow)` purely for the
 *   header label, never for bucketing.
 *
 * Reorder convention (slot-grid): move-up / move-down arrow buttons per item,
 * firing `onReorder`. This matches the established pattern in the Health plan
 * calendars (position-swap arrows) — `KanbanBoard`'s `@dnd-kit` drag is for
 * cross-column staging, a different interaction; the slot-grid intentionally
 * reuses the lighter arrow-reorder convention its target consumers already use.
 *
 * Design contract: tokens only. Per-OS accent via optional `slug` (today
 * marker ring + event-chip default tint, slot-grid today-column highlight).
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
  startOfUtcWeek,
  weekRangeLabel,
  type CalendarCell,
} from './calendar-view.utils';

// ─── Shared types ───────────────────────────────────────────────────────────

export type CalendarViewMode = 'month' | 'week';

/** Which layout the primitive renders. `date-grid` is the default. */
export type CalendarViewLayout = 'date-grid' | 'slot-grid';

/** Props common to both layout modes. */
interface CalendarViewCommonProps {
  /** "Today" reference instant. Defaults to `new Date()`. Inject for tests. */
  today?: Date;
  /** Optional per-OS accent for markers + default chip tint. */
  slug?: OsSlug;
  className?: string;
}

// ─── date-grid mode ─────────────────────────────────────────────────────────

export interface CalendarViewDateGridProps<TEvent>
  extends CalendarViewCommonProps {
  /** Selects the month/week date-grid layout. Omit — this is the default. */
  layout?: 'date-grid';
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
}

// ─── slot-grid mode ─────────────────────────────────────────────────────────

/** A named row in the slot-grid. `key` matches `getItemSlot`'s return. */
export interface CalendarSlotDef {
  /** Stable key — matched against `getItemSlot(item)`. */
  key: string;
  /** Human label rendered in the row axis. */
  label: string;
}

/** Direction of an intra-cell reorder step. */
export type CalendarReorderDirection = 'up' | 'down';

/** Payload handed to `onReorder` when a slot-grid item's arrow is clicked. */
export interface CalendarReorderEvent {
  /** The item being moved. */
  itemId: string;
  /** The slot row the item lives in (a `CalendarSlotDef.key`). */
  slotKey: string;
  /** The weekStart-relative day-of-week column (0-6, Monday-first). */
  dayOfWeek: number;
  /** Which way the item moves within its (slot, day) cell. */
  direction: CalendarReorderDirection;
}

/**
 * An optional per-item action button rendered on every slot-grid item — e.g.
 * an "I ate this" / "log workout" affordance. The label may be a function so
 * the consumer can vary copy per item (and supply an accessible name).
 */
export interface CalendarSlotItemAction<TItem> {
  /** Visible label / icon node. A function receives the item. */
  label: React.ReactNode | ((item: TItem) => React.ReactNode);
  /** Accessible name (`aria-label`). A function receives the item. */
  ariaLabel: string | ((item: TItem) => string);
  /** Fired when the action button is clicked. */
  onAction: (item: TItem) => void;
  /** Optional per-item enable/disable predicate. Defaults to always enabled. */
  isEnabled?: (item: TItem) => boolean;
}

export interface CalendarViewSlotGridProps<TItem>
  extends CalendarViewCommonProps {
  /** Selects the slot-row × day-of-week matrix layout. */
  layout: 'slot-grid';
  /** The named slot rows, in render order (top → bottom). */
  slots: CalendarSlotDef[];
  /** Items to place into (slot, day) cells. */
  items: TItem[];
  /**
   * Monday-anchored start-of-week. Columns are the 7 days from here. The
   * component snaps it to a UTC Monday defensively, so any in-week date works.
   */
  weekStart: Date;
  /** Stable key for an item — used as React key + reorder payload. */
  getItemId: (item: TItem) => string;
  /** The slot row an item belongs to (a `CalendarSlotDef.key`). */
  getItemSlot: (item: TItem) => string;
  /** The weekStart-relative day-of-week column (0-6, Monday-first). */
  getItemDayOfWeek: (item: TItem) => number;
  /** The item's ordinal within its (slot, day) cell — items are sorted by it. */
  getItemPosition: (item: TItem) => number;
  /** Render a single item within a cell. */
  renderItem: (item: TItem) => React.ReactNode;
  /**
   * Fired when an item's move-up / move-down arrow is clicked. Not fired at a
   * cell edge (the arrow is disabled there). The consumer owns the position
   * swap + persistence.
   */
  onReorder: (event: CalendarReorderEvent) => void;
  /** Optional per-item action button rendered on every item. */
  itemAction?: CalendarSlotItemAction<TItem>;
  /** Fired when a cell's "+" affordance is clicked. Receives slot + day. */
  onCreate?: (target: { slotKey: string; dayOfWeek: number }) => void;
  /** Fired when navigation steps the week. Omit to hide week navigation. */
  onWeekChange?: (weekStart: Date) => void;
}

/** The full prop union — `layout` discriminates the two modes. */
export type CalendarViewProps<TEvent> =
  | CalendarViewDateGridProps<TEvent>
  | CalendarViewSlotGridProps<TEvent>;

// ─── date-grid: day cell ────────────────────────────────────────────────────

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
  renderEvent: CalendarViewDateGridProps<TEvent>['renderEvent'];
  getEventId: CalendarViewDateGridProps<TEvent>['getEventId'];
  onCreate?: CalendarViewDateGridProps<TEvent>['onCreate'];
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

// ─── slot-grid: item ────────────────────────────────────────────────────────

function SlotItem<TItem>({
  item,
  itemId,
  slotKey,
  dayOfWeek,
  canMoveUp,
  canMoveDown,
  renderItem,
  onReorder,
  itemAction,
}: {
  item: TItem;
  itemId: string;
  slotKey: string;
  dayOfWeek: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  renderItem: CalendarViewSlotGridProps<TItem>['renderItem'];
  onReorder: CalendarViewSlotGridProps<TItem>['onReorder'];
  itemAction?: CalendarSlotItemAction<TItem>;
}) {
  const actionEnabled =
    itemAction && (itemAction.isEnabled ? itemAction.isEnabled(item) : true);
  const actionLabel =
    typeof itemAction?.label === 'function'
      ? itemAction.label(item)
      : itemAction?.label;
  const actionAria =
    typeof itemAction?.ariaLabel === 'function'
      ? itemAction.ariaLabel(item)
      : itemAction?.ariaLabel;

  return (
    <div
      data-testid={`calendar-slot-item-${itemId}`}
      className="rounded border border-border-subtle bg-surface-0 p-1.5"
    >
      <div>{renderItem(item)}</div>
      <div className="mt-1 flex items-center justify-between gap-0.5">
        <div className="flex gap-0.5">
          <button
            type="button"
            aria-label="Move up"
            disabled={!canMoveUp}
            onClick={() =>
              onReorder({ itemId, slotKey, dayOfWeek, direction: 'up' })
            }
            className="rounded p-0.5 text-xs leading-none text-text-tertiary transition hover:text-accent disabled:opacity-30 disabled:hover:text-text-tertiary"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={!canMoveDown}
            onClick={() =>
              onReorder({ itemId, slotKey, dayOfWeek, direction: 'down' })
            }
            className="rounded p-0.5 text-xs leading-none text-text-tertiary transition hover:text-accent disabled:opacity-30 disabled:hover:text-text-tertiary"
          >
            ↓
          </button>
        </div>
        {itemAction && (
          <button
            type="button"
            aria-label={actionAria}
            disabled={!actionEnabled}
            onClick={() => itemAction.onAction(item)}
            className="rounded px-1 py-0.5 text-2xs font-medium text-text-secondary transition hover:text-accent disabled:opacity-40 disabled:hover:text-text-secondary"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── slot-grid: cell ────────────────────────────────────────────────────────

function SlotCell<TItem>({
  slotKey,
  dayOfWeek,
  items,
  isToday,
  getItemId,
  renderItem,
  onReorder,
  itemAction,
  onCreate,
  slug,
}: {
  slotKey: string;
  dayOfWeek: number;
  items: TItem[];
  isToday: boolean;
  getItemId: CalendarViewSlotGridProps<TItem>['getItemId'];
  renderItem: CalendarViewSlotGridProps<TItem>['renderItem'];
  onReorder: CalendarViewSlotGridProps<TItem>['onReorder'];
  itemAction?: CalendarSlotItemAction<TItem>;
  onCreate?: CalendarViewSlotGridProps<TItem>['onCreate'];
  slug?: OsSlug;
}) {
  return (
    <div
      data-testid={`calendar-slot-cell-${slotKey}-${dayOfWeek}`}
      data-today={isToday || undefined}
      className={clsx(
        'flex min-h-[5.5rem] flex-col gap-1.5 border border-border-subtle p-1.5 transition',
        isToday
          ? slug
            ? `bg-os-${slug}/5 ring-1 ring-inset ring-os-${slug}/30`
            : 'bg-accent/5 ring-1 ring-inset ring-accent/30'
          : 'bg-surface-1',
      )}
    >
      {items.map((item, index) => (
        <SlotItem
          key={getItemId(item)}
          item={item}
          itemId={getItemId(item)}
          slotKey={slotKey}
          dayOfWeek={dayOfWeek}
          canMoveUp={index > 0}
          canMoveDown={index < items.length - 1}
          renderItem={renderItem}
          onReorder={onReorder}
          itemAction={itemAction}
        />
      ))}
      {onCreate && (
        <button
          type="button"
          aria-label={`Add to ${slotKey} on day ${dayOfWeek}`}
          onClick={() => onCreate({ slotKey, dayOfWeek })}
          className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-border-subtle py-1 text-2xs text-text-tertiary transition hover:border-accent hover:text-accent"
        >
          + Add
        </button>
      )}
    </div>
  );
}

// ─── slot-grid: layout ──────────────────────────────────────────────────────

function SlotGridCalendar<TItem>({
  slots,
  items,
  weekStart,
  getItemId,
  getItemSlot,
  getItemDayOfWeek,
  getItemPosition,
  renderItem,
  onReorder,
  itemAction,
  onCreate,
  onWeekChange,
  today,
  slug,
  className,
}: CalendarViewSlotGridProps<TItem>) {
  const todayRef = today ?? new Date();
  // Snap to a UTC Monday so any in-week date works as `weekStart`.
  const monday = useMemo(() => startOfUtcWeek(weekStart), [weekStart]);

  /** weekStart-relative day-of-week (0-6) for "today", or null if out of week. */
  const todayDow = useMemo(() => {
    const diffDays = Math.round(
      (Date.UTC(
        todayRef.getUTCFullYear(),
        todayRef.getUTCMonth(),
        todayRef.getUTCDate(),
      ) -
        monday.getTime()) /
        86_400_000,
    );
    return diffDays >= 0 && diffDays <= 6 ? diffDays : null;
  }, [todayRef, monday]);

  /** Items bucketed by `${slotKey}:${dayOfWeek}`, each bucket position-sorted. */
  const itemsByCell = useMemo(() => {
    const map = new Map<string, TItem[]>();
    for (const item of items) {
      const key = `${getItemSlot(item)}:${getItemDayOfWeek(item)}`;
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => getItemPosition(a) - getItemPosition(b));
    }
    return map;
  }, [items, getItemSlot, getItemDayOfWeek, getItemPosition]);

  /** Header label per column: weekday name + month/day, derived in UTC. */
  const columns = useMemo(
    () =>
      WEEKDAY_LABELS.map((label, dow) => {
        const date = addUtcDays(monday, dow);
        const dayLabel = new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(date);
        return { dow, label, dayLabel, key: dateKey(date) };
      }),
    [monday],
  );

  function navigate(direction: -1 | 1) {
    onWeekChange?.(addUtcDays(monday, direction * 7));
  }

  return (
    <div
      data-testid="calendar-view"
      data-layout="slot-grid"
      className={clsx('group flex flex-col gap-3', className)}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {onWeekChange && (
            <>
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
                onClick={() => onWeekChange(startOfUtcWeek(todayRef))}
                className="rounded-md border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-accent hover:text-text-primary"
              >
                This week
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={() => navigate(1)}
                className="rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-sm text-text-secondary transition hover:border-accent hover:text-text-primary"
              >
                ›
              </button>
            </>
          )}
          <div className="ml-1 flex items-baseline gap-2">
            <h3 className="text-base font-semibold text-text-primary">
              {weekRangeLabel(monday)}
            </h3>
            <span className="font-mono text-2xs uppercase tracking-wide text-text-tertiary">
              {isoWeek(monday)}
            </span>
          </div>
        </div>
      </div>

      {/* Slot × day matrix */}
      <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-2">
        <div className="min-w-[760px]">
          {/* Column header: a leading slot-axis spacer + 7 weekday columns. */}
          <div className="grid grid-cols-[7rem_repeat(7,1fr)]">
            <div className="border-b border-border-subtle px-2 py-1.5" />
            {columns.map((col) => (
              <div
                key={col.dow}
                data-testid={`calendar-slot-col-${col.dow}`}
                data-today={todayDow === col.dow || undefined}
                className={clsx(
                  'border-b border-border-subtle px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide',
                  todayDow === col.dow
                    ? 'text-text-primary'
                    : 'text-text-tertiary',
                )}
              >
                <div>{col.label}</div>
                <div className="font-normal normal-case tracking-normal text-text-tertiary">
                  {col.dayLabel}
                </div>
              </div>
            ))}
          </div>

          {/* One row per slot definition. */}
          {slots.map((slot) => (
            <div
              key={slot.key}
              data-testid={`calendar-slot-row-${slot.key}`}
              className="grid grid-cols-[7rem_repeat(7,1fr)]"
            >
              <div className="flex items-start border border-border-subtle bg-surface-1 px-2 py-2 text-xs font-medium text-text-primary">
                {slot.label}
              </div>
              {columns.map((col) => (
                <SlotCell
                  key={col.dow}
                  slotKey={slot.key}
                  dayOfWeek={col.dow}
                  items={itemsByCell.get(`${slot.key}:${col.dow}`) ?? []}
                  isToday={todayDow === col.dow}
                  getItemId={getItemId}
                  renderItem={renderItem}
                  onReorder={onReorder}
                  itemAction={itemAction}
                  onCreate={onCreate}
                  slug={slug}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── date-grid: layout ──────────────────────────────────────────────────────

function DateGridCalendar<TEvent>({
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
}: CalendarViewDateGridProps<TEvent>) {
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
      data-layout="date-grid"
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

// ─── CalendarView ───────────────────────────────────────────────────────────

/**
 * Generic calendar primitive. The `layout` prop discriminates the two modes;
 * each mode's remaining props are checked against the matching union member.
 */
export function CalendarView<TEvent>(props: CalendarViewProps<TEvent>) {
  if (props.layout === 'slot-grid') {
    return <SlotGridCalendar {...props} />;
  }
  return <DateGridCalendar {...props} />;
}

export default CalendarView;
