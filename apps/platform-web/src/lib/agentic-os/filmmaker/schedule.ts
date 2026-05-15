/**
 * Filmmaker OS — Schedule domain types and constants.
 *
 * Shooting days and stripboard strips. Scenes from the Phase 4 parser
 * are dragged onto days via strips.
 *
 * No database calls here — those live in repo.ts.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import type { ScreenplayScene } from './screenplays';
import type { SceneBreakdownMeta } from './breakdown';

// ─── Unit ──────────────────────────────────────────────────────────────────

export const SHOOTING_UNIT_VALUES = [
  'main',
  'second_unit',
  'splinter',
] as const;

export type ShootingUnit = (typeof SHOOTING_UNIT_VALUES)[number];

export interface ShootingUnitInfo {
  unit: ShootingUnit;
  label: string;
  description: string;
}

export const SHOOTING_UNITS: ShootingUnitInfo[] = [
  { unit: 'main', label: 'Main Unit', description: 'Principal photography.' },
  { unit: 'second_unit', label: 'Second Unit', description: 'Inserts, pickups, B-roll.' },
  { unit: 'splinter', label: 'Splinter', description: 'Parallel small crew.' },
];

export const SHOOTING_UNIT_LABEL: Record<ShootingUnit, string> = Object.fromEntries(
  SHOOTING_UNITS.map((u) => [u.unit, u.label]),
) as Record<ShootingUnit, string>;

// ─── Status ────────────────────────────────────────────────────────────────

export const SHOOTING_DAY_STATUS_VALUES = [
  'planned',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type ShootingDayStatus = (typeof SHOOTING_DAY_STATUS_VALUES)[number];

export interface ShootingDayStatusInfo {
  status: ShootingDayStatus;
  label: string;
  color: string;
}

// Status chip classes use semantic design tokens (see `_design/tokens.md` §4).
// `planned` maps to the muted-surface treatment matching DashboardHub's
// "planned" badge precedent (status is neutral; no positive/warning/danger
// fits). `in_progress` → `warning` (focus needed), `completed` → `positive`,
// `cancelled` → most muted text + canvas surface.
export const SHOOTING_DAY_STATUSES: ShootingDayStatusInfo[] = [
  { status: 'planned', label: 'Planned', color: 'text-text-secondary bg-surface-2 border-border-subtle' },
  { status: 'in_progress', label: 'In Progress', color: 'text-warning bg-warning/10 border-warning/30' },
  { status: 'completed', label: 'Completed', color: 'text-positive bg-positive/10 border-positive/30' },
  { status: 'cancelled', label: 'Cancelled', color: 'text-text-tertiary bg-surface-0 border-border-subtle' },
];

export const SHOOTING_DAY_STATUS_LABEL: Record<ShootingDayStatus, string> =
  Object.fromEntries(
    SHOOTING_DAY_STATUSES.map((s) => [s.status, s.label]),
  ) as Record<ShootingDayStatus, string>;

// ─── Entities ──────────────────────────────────────────────────────────────

export interface ShootingDay {
  id: string;
  projectId: string;
  shootDate: string | null;
  dayNumber: number;
  label: string | null;
  callTime: string | null;
  wrapTime: string | null;
  unit: ShootingUnit;
  status: ShootingDayStatus;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ShootingDayUpsert {
  shootDate?: string | null;
  dayNumber?: number;
  label?: string | null;
  callTime?: string | null;
  wrapTime?: string | null;
  unit?: ShootingUnit;
  status?: ShootingDayStatus;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ScheduleStrip {
  id: string;
  shootingDayId: string;
  sceneId: string;
  orderIndex: number;
  estMinutes: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A strip joined with its scene + scene-meta — what the stripboard renders. */
export interface ScheduleStripJoined extends ScheduleStrip {
  scene: ScreenplayScene;
  sceneMeta: SceneBreakdownMeta | null;
}

export interface ShootingDayWithStrips extends ShootingDay {
  strips: ScheduleStripJoined[];
}

export interface ProjectScheduleSummary {
  totalDays: number;
  scheduledScenes: number;
  unscheduledScenes: number;
  totalScenes: number;
  totalEighths: number;
  scheduledEighths: number;
  totalScheduledMinutes: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Sum estimated shoot minutes across a day's strips. Strip-level
 * `estMinutes` wins; falls back to the scene's `estShootMinutes`.
 */
export function totalShootMinutes(day: ShootingDayWithStrips): number {
  return day.strips.reduce((acc, s) => {
    const minutes = s.estMinutes ?? s.sceneMeta?.estShootMinutes ?? 0;
    return acc + minutes;
  }, 0);
}

/** Sum scheduled eighths across a day's strips (uses scene meta eighths). */
export function totalEighths(day: ShootingDayWithStrips): number {
  return day.strips.reduce((acc, s) => acc + (s.sceneMeta?.eighths ?? 0), 0);
}

/** Group days by unit for split-view rendering. */
export function groupByUnit(days: ShootingDay[]): Record<ShootingUnit, ShootingDay[]> {
  const out: Record<ShootingUnit, ShootingDay[]> = {
    main: [],
    second_unit: [],
    splinter: [],
  };
  for (const d of days) {
    out[d.unit].push(d);
  }
  return out;
}

// ─── TimelineView adapter (Wave D specialization) ──────────────────────────

/**
 * One dated shooting day, shaped for the shared `TimelineView` primitive.
 * Only days with a `shootDate` can be placed on a calendar axis — undated
 * days stay ordinal and are surfaced by the bespoke two-pane editor only.
 *
 * `start` / `end` are the same UTC day (a single-day span); `laneId` is the
 * shooting unit so main / second-unit / splinter days stack into rows.
 */
export interface ScheduleTimelineItem {
  id: string;
  start: Date;
  end: Date;
  laneId: ShootingUnit;
  dayNumber: number;
  label: string | null;
  unit: ShootingUnit;
  status: ShootingDayStatus;
  sceneCount: number;
  eighths: number;
  shootMinutes: number;
}

/** Parse a `YYYY-MM-DD` string into a UTC Date, or null if unparseable. */
function parseUtcDate(value: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Map dated shooting days into `TimelineView` items. Undated days are
 * dropped (they have no axis position) — callers should fall back to the
 * ordinal day stack for those. Returns items sorted by date.
 */
export function buildScheduleTimelineItems(
  days: ShootingDayWithStrips[],
): ScheduleTimelineItem[] {
  const items: ScheduleTimelineItem[] = [];
  for (const day of days) {
    const date = parseUtcDate(day.shootDate);
    if (!date) continue;
    items.push({
      id: day.id,
      start: date,
      end: date,
      laneId: day.unit,
      dayNumber: day.dayNumber,
      label: day.label,
      unit: day.unit,
      status: day.status,
      sceneCount: day.strips.length,
      eighths: totalEighths(day),
      shootMinutes: totalShootMinutes(day),
    });
  }
  return items.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Compute the visible `{ start, end }` window for the schedule timeline:
 * the earliest dated day minus 2 days, the latest plus 2, so the strip
 * has breathing room at both edges. Returns null when nothing is dated.
 */
export function scheduleTimelineRange(
  items: ScheduleTimelineItem[],
): { start: Date; end: Date } | null {
  if (items.length === 0) return null;
  const times = items.map((i) => i.start.getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const PAD = 2 * 86_400_000;
  // Guarantee a non-zero span even when every day shares one date.
  const start = new Date(min - PAD);
  const end = new Date(max + PAD);
  return { start, end };
}
