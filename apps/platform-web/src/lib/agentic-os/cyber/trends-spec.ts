/**
 * CyberSec OS — trends dashboard data-shape adapters (Wave D, UI Depth Wave).
 *
 * Pure, synchronous adapters that reshape the existing `TrendsPayload` into
 * the structures the Wave D trends widget grid consumes. No DB access, no new
 * queries — this is the "minimal primitive data-shape adapter" the brief
 * allows under `lib/agentic-os/cyber/`. The trends page server component
 * fetches `TrendsPayload` exactly as before and calls these to assemble the
 * grid.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import type { TrendsPayload } from './repo';

/**
 * IOC hit-rate over the 7d and 30d windows.
 *
 * "Hit rate" = IOC-matching alerts as a share of *all* alerts in the same
 * window. It answers "how much of my alert volume is explained by known
 * indicators?" — a high rate means threat-intel is doing real work; a near-
 * zero rate means either a clean environment or stale IOCs.
 *
 * Both inputs already exist on `TrendsPayload`:
 *  - `iocHitsLast7d` / `iocHitsLast30d` — the numerators (from
 *    `matchIocAgainstAlerts`).
 *  - `alertsByDay` — the denominator: summed `total` over the trailing 7 / 30
 *    days. `alertsByDay` is the rolling-30d series, so the 30d denominator is
 *    its full sum and the 7d denominator is the last 7 entries' sum.
 */
export interface IocHitRatePoint {
  /** Window label — '7d' or '30d'. */
  window: '7d' | '30d';
  /** IOC-matching alert count in the window. */
  hits: number;
  /** Total alert count in the window (the denominator). */
  totalAlerts: number;
  /** hits / totalAlerts as a 0–100 percentage; 0 when there are no alerts. */
  hitRatePct: number;
}

/** Sum the `total` field over the trailing `days` entries of `alertsByDay`. */
function sumTrailingTotals(
  alertsByDay: TrendsPayload['alertsByDay'],
  days: number,
): number {
  // `alertsByDay` is date-ascending; the trailing `days` entries are the most
  // recent. Guards against a shorter-than-`days` series.
  const tail = alertsByDay.slice(Math.max(0, alertsByDay.length - days));
  return tail.reduce((acc, d) => acc + d.total, 0);
}

/** Build the 7d + 30d IOC hit-rate points from an existing `TrendsPayload`. */
export function buildIocHitRate(trends: TrendsPayload): IocHitRatePoint[] {
  const total7d = sumTrailingTotals(trends.alertsByDay, 7);
  const total30d = sumTrailingTotals(trends.alertsByDay, 30);

  const rate = (hits: number, total: number) =>
    total > 0 ? Math.round((hits / total) * 1000) / 10 : 0;

  return [
    {
      window: '7d',
      hits: trends.iocHitsLast7d,
      totalAlerts: total7d,
      hitRatePct: rate(trends.iocHitsLast7d, total7d),
    },
    {
      window: '30d',
      hits: trends.iocHitsLast30d,
      totalAlerts: total30d,
      hitRatePct: rate(trends.iocHitsLast30d, total30d),
    },
  ];
}
