/**
 * Pantheon UI Depth Wave — `CalendarView` helper utilities (Wave B.3).
 *
 * Pure, timezone-deterministic date math for the `CalendarView` primitive.
 * Everything here operates in **UTC** — same contract as `calendar.ts`'s
 * `isoWeek()` (fixed to UTC accessors in v0.1.58). The v0.1.58 TZ-leak bug
 * was a shadow `isoWeek` reading local accessors; this file deliberately
 * keeps all grid math UTC-based so the month/week grid is identical on any
 * host timezone.
 *
 * This file does NOT reimplement `isoWeek` — `CalendarView` imports that from
 * `@/lib/agentic-os/creator/calendar`. What lives here is grid-construction
 * math (month cell layout, week-strip layout, navigation) which is specific
 * to the rendering primitive and does not belong in the Creator domain lib.
 *
 * @license MIT — Tiresias platform (internal).
 */

/** OS slug union — mirrors `lib/agentic-os/registry.ts`. Shared by Wave B.3 views. */
export type OsSlug =
  | 'health'
  | 'maker'
  | 'research'
  | 'secure-dev'
  | 'filmmaker'
  | 'cyber'
  | 'autobiographer'
  | 'business'
  | 'creator';

/** A single rendered calendar cell. `date` is always UTC midnight. */
export interface CalendarCell {
  /** UTC-midnight Date for this day. */
  date: Date;
  /** YYYY-MM-DD key (UTC) — stable, timezone-proof bucket key. */
  key: string;
  /** Day-of-month number (1-31), read in UTC. */
  dayOfMonth: number;
  /** True when the cell belongs to the focused month (false for grid spill days). */
  inCurrentMonth: boolean;
  /** True when the cell is "today" relative to the supplied reference instant. */
  isToday: boolean;
  /** True for Saturday / Sunday (UTC). */
  isWeekend: boolean;
}

/** Construct a UTC-midnight Date from Y/M/D parts. */
export function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/**
 * The YYYY-MM-DD key for a Date, read in UTC. This is the canonical bucket
 * key — matching events to cells must use this, never `toLocaleDateString`.
 */
export function dateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True when two Dates fall on the same UTC calendar day. */
export function isSameUtcDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

/**
 * Add `n` calendar months to a UTC-midnight Date, clamping the day-of-month
 * so e.g. Jan 31 + 1mo = Feb 28/29 rather than spilling into March.
 */
export function addUtcMonths(date: Date, n: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const target = new Date(Date.UTC(y, m + n, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)),
  );
}

/** Add `n` days to a UTC-midnight Date. */
export function addUtcDays(date: Date, n: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + n),
  );
}

/**
 * Monday-anchored start-of-week for a UTC Date. ISO 8601 week starts Monday;
 * `CalendarView`'s week view + month-grid leading row both anchor here so the
 * grid is consistent with `calendar.ts`'s ISO `isoWeek()`.
 */
export function startOfUtcWeek(date: Date): Date {
  const day = date.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  return addUtcDays(date, diff);
}

/**
 * Build the 6-row × 7-col month grid (always 42 cells) for the month
 * containing `focus`. Leading/trailing cells spill into adjacent months and
 * carry `inCurrentMonth: false`. `today` decides which cell is marked.
 */
export function buildMonthGrid(focus: Date, today: Date): CalendarCell[] {
  const year = focus.getUTCFullYear();
  const month = focus.getUTCMonth();
  const firstOfMonth = utcDay(year, month, 1);
  const gridStart = startOfUtcWeek(firstOfMonth);

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = addUtcDays(gridStart, i);
    const dow = date.getUTCDay();
    cells.push({
      date,
      key: dateKey(date),
      dayOfMonth: date.getUTCDate(),
      inCurrentMonth: date.getUTCMonth() === month,
      isToday: isSameUtcDay(date, today),
      isWeekend: dow === 0 || dow === 6,
    });
  }
  return cells;
}

/**
 * Build the 7-cell week strip (Mon-Sun) for the week containing `focus`.
 * Every cell carries `inCurrentMonth: true` — there is no spill concept in
 * the week view, but the field is kept for a uniform `CalendarCell` shape.
 */
export function buildWeekGrid(focus: Date, today: Date): CalendarCell[] {
  const weekStart = startOfUtcWeek(focus);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addUtcDays(weekStart, i);
    const dow = date.getUTCDay();
    cells.push({
      date,
      key: dateKey(date),
      dayOfMonth: date.getUTCDate(),
      inCurrentMonth: true,
      isToday: isSameUtcDay(date, today),
      isWeekend: dow === 0 || dow === 6,
    });
  }
  return cells;
}

/** Monday-first weekday short labels for the grid header. */
export const WEEKDAY_LABELS = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;

/** "May 2026" style label for the focused month, formatted via `Intl` in UTC. */
export function monthLabel(focus: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(focus);
}

/** "May 11 – 17, 2026" style label for a week range, formatted via `Intl` in UTC. */
export function weekRangeLabel(focus: Date): string {
  const start = startOfUtcWeek(focus);
  const end = addUtcDays(start, 6);
  const fmtDay = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const fmtEnd = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${fmtDay.format(start)} – ${fmtEnd.format(end)}`;
}
