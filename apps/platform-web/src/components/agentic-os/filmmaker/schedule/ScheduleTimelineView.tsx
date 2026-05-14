'use client';

/**
 * Filmmaker OS — ScheduleTimelineView (Wave D specialization).
 *
 * A read-only calendar-axis overview of *dated* shooting days, built on the
 * shared `TimelineView` primitive. This is a specialization, not a
 * replacement: the stripboard's editing model (drag scenes between days,
 * reorder strips, inline-edit day metadata, per-day call sheets, the
 * unscheduled-scenes pane) genuinely cannot be expressed by `TimelineView` —
 * and many shooting days have a null `shootDate` (days are ordinal first,
 * dated second). So the bespoke two-pane editor stays; this view sits above
 * it and answers "what's the shoot calendar shape" for the dated subset.
 *
 * Lanes = shooting units (main / second-unit / splinter), so parallel-unit
 * days stack into their own rows. Clicking a day's marker scrolls the page
 * to that day's card in the editor below (deep-link parity via `#day-<id>`).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useMemo } from 'react';
import {
  TimelineView,
  type TimelineLane,
} from '@/components/agentic-os/_shared/views';
import {
  SHOOTING_DAY_STATUS_LABEL,
  SHOOTING_UNIT_LABEL,
  SHOOTING_UNIT_VALUES,
  buildScheduleTimelineItems,
  scheduleTimelineRange,
  type ScheduleTimelineItem,
  type ShootingDayWithStrips,
} from '@/lib/agentic-os/filmmaker/schedule';
import { pagesLabel } from '@/lib/agentic-os/filmmaker/breakdown';

interface Props {
  days: ShootingDayWithStrips[];
}

/** Status → token-driven marker tint. */
const STATUS_DOT: Record<ScheduleTimelineItem['status'], string> = {
  planned: 'bg-os-filmmaker',
  in_progress: 'bg-warning',
  completed: 'bg-positive',
  cancelled: 'bg-text-tertiary',
};

export function ScheduleTimelineView({ days }: Props) {
  const items = useMemo(() => buildScheduleTimelineItems(days), [days]);
  const range = useMemo(() => scheduleTimelineRange(items), [items]);

  // Only show lanes for units that actually have a dated day.
  const lanes = useMemo<TimelineLane[]>(() => {
    const present = new Set(items.map((i) => i.laneId));
    return SHOOTING_UNIT_VALUES.filter((u) => present.has(u)).map((u) => ({
      id: u,
      label: SHOOTING_UNIT_LABEL[u],
    }));
  }, [items]);

  // Nothing dated → don't render the section at all (caller also guards).
  if (!range || items.length === 0) return null;

  function scrollToDay(id: string) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(`day-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <section className="space-y-2" data-testid="schedule-timeline">
      <div className="flex items-center justify-between">
        <h2 className="text-2xs font-semibold uppercase tracking-wide text-text-tertiary">
          Shoot calendar{' '}
          <span className="tabular-nums text-text-secondary">
            ({items.length} dated)
          </span>
        </h2>
        <span className="text-2xs text-text-tertiary">
          {days.length - items.length > 0
            ? `${days.length - items.length} undated day${days.length - items.length === 1 ? '' : 's'} below`
            : 'all days dated'}
        </span>
      </div>

      <TimelineView<ScheduleTimelineItem>
        items={items}
        range={range}
        lanes={lanes.length > 1 ? lanes : undefined}
        slug="filmmaker"
        onItemClick={(item) => scrollToDay(item.id)}
        emptyLabel="No dated shooting days yet — set a date on a day to place it here."
        renderItem={(item) => (
          <div
            className="flex flex-col items-center gap-1"
            title={`Day ${item.dayNumber}${item.label ? ` — ${item.label}` : ''} · ${SHOOTING_DAY_STATUS_LABEL[item.status]}`}
          >
            <span
              className={`h-2.5 w-2.5 rotate-45 rounded-[2px] ring-2 ring-surface-1 ${STATUS_DOT[item.status]}`}
            />
            <span className="max-w-[7rem] truncate text-2xs tabular-nums text-text-secondary">
              D{item.dayNumber}
              {item.sceneCount > 0 && (
                <span className="ml-1 text-text-tertiary">
                  · {item.sceneCount}sc
                </span>
              )}
              {item.eighths > 0 && (
                <span className="ml-1 text-text-tertiary">
                  · {pagesLabel(item.eighths)}pp
                </span>
              )}
            </span>
          </div>
        )}
      />
    </section>
  );
}
