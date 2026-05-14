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

export const SHOOTING_DAY_STATUSES: ShootingDayStatusInfo[] = [
  { status: 'planned', label: 'Planned', color: 'text-blue-300 bg-blue-500/10 border-blue-500/30' },
  { status: 'in_progress', label: 'In Progress', color: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  { status: 'completed', label: 'Completed', color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  { status: 'cancelled', label: 'Cancelled', color: 'text-[#64748b] bg-surface-0 border-border-subtle' },
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
