/**
 * Pantheon UI Depth Wave — `TimelineView` shared view primitive (Wave B.3).
 *
 * A time-axis view for chronological entities that have **duration** — spans,
 * milestones, and arcs. Distinct from B.1's `ActivityFeed`, which is a
 * discrete-event log: `ActivityFeed` answers "what happened", `TimelineView`
 * answers "what runs when, and for how long". Generalizes the three
 * independent ad-hoc implementations today (`experiment-phase-progress.tsx`,
 * `milestone-strip.tsx`, `phase-progress-editor.tsx`) plus Autobiographer's
 * decade-grouped memory timeline.
 *
 * Layout model:
 * - A fixed `range` ({ start, end }) defines the visible window.
 * - Items are positioned by percentage offset within that window — flex +
 *   absolute positioning, no layout library, ~matches the plan's ~300 LOC.
 * - Items with `end` render as spans (a bar). Items without `end` render as
 *   milestone points (a diamond marker).
 * - Optional `lanes` stack items into named horizontal rows (e.g. one lane
 *   per project / per experiment). Without lanes, everything shares one lane.
 *
 * All positioning math is UTC-safe: offsets are computed from `.getTime()`
 * epoch millis, so host timezone never shifts a bar.
 *
 * Design contract: tokens only. Per-OS accent via optional `slug` (span fill +
 * milestone marker default color).
 *
 * @license MIT — Tiresias platform (internal).
 */

'use client';

import { useMemo } from 'react';
import clsx from 'clsx';
import type { OsSlug } from './CalendarView.utils';

// ─── Types ──────────────────────────────────────────────────────────────────

/** The visible time window. Items are clamped/positioned within this range. */
export interface TimelineRange {
  start: Date;
  end: Date;
}

/** An optional named horizontal row. Items reference a lane by `id`. */
export interface TimelineLane {
  id: string;
  label: string;
}

/**
 * Minimal item shape. `start` is required. `end` present ⇒ span (bar);
 * `end` absent ⇒ milestone (point marker). `laneId` slots the item into a
 * lane when `lanes` is supplied. Everything else is consumer-defined and
 * surfaced through `renderItem`.
 */
export interface TimelineItemBase {
  id: string;
  start: Date;
  end?: Date | null;
  laneId?: string;
}

/** Geometry handed to `renderItem` so the consumer can style by kind. */
export interface TimelineItemGeometry {
  /** True when the item has an `end` (a span); false for a milestone point. */
  isSpan: boolean;
  /** Left offset within the lane track, as a 0-100 percentage. */
  offsetPct: number;
  /** Width of a span, as a 0-100 percentage. 0 for milestones. */
  widthPct: number;
  /** True when the item's range falls partly outside `range` and was clamped. */
  clamped: boolean;
}

export interface TimelineViewProps<TItem extends TimelineItemBase> {
  items: TItem[];
  /** The visible time window. Items outside it are dropped. */
  range: TimelineRange;
  /** Optional lanes. When omitted, all items share a single anonymous lane. */
  lanes?: TimelineLane[];
  /** Render a single item. Receives positioning geometry for styling. */
  renderItem: (item: TItem, geometry: TimelineItemGeometry) => React.ReactNode;
  /** Fired when an item is activated (click / Enter). */
  onItemClick?: (item: TItem) => void;
  /** Orientation. `horizontal` (time → x) is the default; `vertical` stacks rows. */
  orientation?: 'horizontal' | 'vertical';
  /** Number of evenly spaced axis tick labels. Defaults to 5. Set 0 to hide. */
  tickCount?: number;
  /** Optional per-OS accent for default span fill + milestone markers. */
  slug?: OsSlug;
  /** Copy shown when no items fall within `range`. */
  emptyLabel?: string;
  className?: string;
}

// ─── Geometry helpers ───────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Clamp `n` into [min, max]. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Compute an item's geometry within `range`. Returns `null` when the item
 * lies entirely outside the window (so it can be filtered out).
 */
export function computeGeometry(
  item: TimelineItemBase,
  range: TimelineRange,
): TimelineItemGeometry | null {
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();
  const span = rangeEnd - rangeStart;
  if (span <= 0) return null;

  const itemStart = item.start.getTime();
  const itemEnd = item.end ? item.end.getTime() : itemStart;
  const isSpan = item.end != null && itemEnd > itemStart;

  // Entirely outside the window → drop.
  if (itemEnd < rangeStart || itemStart > rangeEnd) return null;

  const clampedStart = clamp(itemStart, rangeStart, rangeEnd);
  const clampedEnd = clamp(itemEnd, rangeStart, rangeEnd);
  const wasClamped = clampedStart !== itemStart || clampedEnd !== itemEnd;

  const offsetPct = ((clampedStart - rangeStart) / span) * 100;
  const widthPct = isSpan ? ((clampedEnd - clampedStart) / span) * 100 : 0;

  return { isSpan, offsetPct, widthPct, clamped: wasClamped };
}

/** Evenly spaced axis tick labels across `range`, formatted via `Intl` in UTC. */
function buildTicks(range: TimelineRange, count: number) {
  if (count <= 0) return [];
  const start = range.start.getTime();
  const end = range.end.getTime();
  const totalDays = (end - start) / DAY_MS;
  // Year-granularity labels for wide ranges, otherwise month + day.
  const fmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: totalDays > 365 ? undefined : 'numeric',
    year: totalDays > 365 ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
  const ticks: { pct: number; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const pct = (i / (count - 1)) * 100;
    const t = start + ((end - start) * i) / (count - 1);
    ticks.push({ pct, label: fmt.format(new Date(t)) });
  }
  return ticks;
}

// ─── Item renderer ──────────────────────────────────────────────────────────

function PositionedItem<TItem extends TimelineItemBase>({
  item,
  geometry,
  renderItem,
  onItemClick,
  orientation,
  slug,
}: {
  item: TItem;
  geometry: TimelineItemGeometry;
  renderItem: TimelineViewProps<TItem>['renderItem'];
  onItemClick?: TimelineViewProps<TItem>['onItemClick'];
  orientation: 'horizontal' | 'vertical';
  slug?: OsSlug;
}) {
  const interactive = !!onItemClick;
  const horizontal = orientation === 'horizontal';

  // Position along the time axis. For spans, also size along that axis.
  const style: React.CSSProperties = horizontal
    ? {
        left: `${geometry.offsetPct}%`,
        width: geometry.isSpan ? `${Math.max(geometry.widthPct, 0)}%` : undefined,
      }
    : {
        top: `${geometry.offsetPct}%`,
        height: geometry.isSpan ? `${Math.max(geometry.widthPct, 0)}%` : undefined,
      };

  return (
    <div
      data-testid={`timeline-item-${item.id}`}
      data-kind={geometry.isSpan ? 'span' : 'milestone'}
      data-clamped={geometry.clamped || undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onItemClick!(item) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onItemClick!(item);
              }
            }
          : undefined
      }
      style={style}
      className={clsx(
        'absolute',
        horizontal ? 'top-1/2 -translate-y-1/2' : 'left-1/2 -translate-x-1/2',
        geometry.isSpan ? 'min-w-[2px]' : '',
        interactive &&
          'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent',
      )}
    >
      {renderItem(item, geometry)}
    </div>
  );
}

// ─── Default item rendering fallback ────────────────────────────────────────

/**
 * A minimal token-driven default chip — used when a consumer just wants a
 * functional timeline without writing a `renderItem`. Span ⇒ a filled bar,
 * milestone ⇒ a diamond marker. Exported so adopters can compose around it.
 */
export function defaultTimelineItem(
  label: string,
  geometry: TimelineItemGeometry,
  slug?: OsSlug,
): React.ReactNode {
  if (geometry.isSpan) {
    return (
      <div
        className={clsx(
          'flex h-5 items-center overflow-hidden rounded px-1.5 text-2xs font-medium text-white',
          slug ? `bg-os-${slug}/70` : 'bg-accent/70',
        )}
        title={label}
      >
        <span className="truncate">{label}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-0.5" title={label}>
      <span
        className={clsx(
          'h-2.5 w-2.5 rotate-45 rounded-[2px] ring-2 ring-surface-2',
          slug ? `bg-os-${slug}` : 'bg-accent',
        )}
      />
      <span className="max-w-[7rem] truncate text-2xs text-text-tertiary">
        {label}
      </span>
    </div>
  );
}

// ─── TimelineView ───────────────────────────────────────────────────────────

export function TimelineView<TItem extends TimelineItemBase>({
  items,
  range,
  lanes,
  renderItem,
  onItemClick,
  orientation = 'horizontal',
  tickCount = 5,
  slug,
  emptyLabel = 'Nothing scheduled in this range yet.',
  className,
}: TimelineViewProps<TItem>) {
  const horizontal = orientation === 'horizontal';

  /** Resolve lanes: explicit lanes, or a single anonymous catch-all lane. */
  const resolvedLanes: TimelineLane[] = useMemo(
    () => (lanes && lanes.length > 0 ? lanes : [{ id: '__all__', label: '' }]),
    [lanes],
  );

  /** Items grouped by lane, each carrying its computed geometry. */
  const itemsByLane = useMemo(() => {
    const map = new Map<
      string,
      { item: TItem; geometry: TimelineItemGeometry }[]
    >();
    for (const lane of resolvedLanes) map.set(lane.id, []);

    for (const item of items) {
      const geometry = computeGeometry(item, range);
      if (!geometry) continue;
      const laneId =
        lanes && lanes.length > 0 ? (item.laneId ?? lanes[0]!.id) : '__all__';
      const bucket = map.get(laneId);
      if (bucket) bucket.push({ item, geometry });
    }
    return map;
  }, [items, range, lanes, resolvedLanes]);

  const visibleCount = useMemo(
    () =>
      Array.from(itemsByLane.values()).reduce((sum, b) => sum + b.length, 0),
    [itemsByLane],
  );

  const ticks = useMemo(
    () => buildTicks(range, tickCount),
    [range, tickCount],
  );

  if (visibleCount === 0) {
    return (
      <div
        data-testid="timeline-view"
        className={clsx(
          'rounded-xl border border-dashed border-border-subtle bg-surface-2/50 p-6 text-center text-sm text-text-secondary',
          className,
        )}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      data-testid="timeline-view"
      data-orientation={orientation}
      className={clsx(
        'rounded-xl border border-border-subtle bg-surface-2 p-3',
        className,
      )}
    >
      {/* Axis ticks */}
      {ticks.length > 0 && (
        <div
          className={clsx(
            'relative text-2xs text-text-tertiary',
            horizontal ? 'mb-2 h-4' : 'float-left mr-2 h-full w-12',
          )}
        >
          {ticks.map((tick, i) => (
            <span
              key={i}
              className="absolute whitespace-nowrap"
              style={
                horizontal
                  ? {
                      left: `${tick.pct}%`,
                      transform:
                        i === 0
                          ? 'translateX(0)'
                          : i === ticks.length - 1
                            ? 'translateX(-100%)'
                            : 'translateX(-50%)',
                    }
                  : { top: `${tick.pct}%` }
              }
            >
              {tick.label}
            </span>
          ))}
        </div>
      )}

      {/* Lanes */}
      <div className={clsx('flex', horizontal ? 'flex-col gap-2' : 'flex-row gap-3')}>
        {resolvedLanes.map((lane) => {
          const laneItems = itemsByLane.get(lane.id) ?? [];
          return (
            <div
              key={lane.id}
              data-testid={`timeline-lane-${lane.id}`}
              className={clsx('flex', horizontal ? 'flex-row items-stretch' : 'flex-col')}
            >
              {lane.label && (
                <div
                  className={clsx(
                    'shrink-0 text-xs font-medium text-text-secondary',
                    horizontal
                      ? 'flex w-32 items-center pr-3'
                      : 'pb-1.5 text-center',
                  )}
                >
                  {lane.label}
                </div>
              )}
              <div
                className={clsx(
                  'relative flex-1 rounded-lg bg-surface-1',
                  horizontal ? 'h-12' : 'min-h-[16rem] w-12',
                )}
              >
                {laneItems.map(({ item, geometry }) => (
                  <PositionedItem
                    key={item.id}
                    item={item}
                    geometry={geometry}
                    renderItem={renderItem}
                    onItemClick={onItemClick}
                    orientation={orientation}
                    slug={slug}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TimelineView;
