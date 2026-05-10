/**
 * Cross-OS mood-delta watcher.
 *
 * Generic enough to apply to any OS that records (mood_before, mood_after,
 * timestamp) tuples. Health OS uses it on CBT logs to flag when an
 * exercise *consistently* leaves the user feeling worse — a signal that
 * deserves clinical follow-up rather than another wizard.
 *
 * The detector is intentionally simple and conservative:
 *   - Look at logs whose `completed_at` (or `started_at`) falls inside a
 *     window (default last 7 days).
 *   - Only count logs where both `mood_before` and `mood_after` are
 *     defined numbers; partial logs are ignored.
 *   - Compute the delta `mood_after - mood_before` for each log.
 *   - Trigger when at least `threshold` logs (default 3) show a drop of
 *     at least `dropMagnitude` (default 3) on the 1..10 scale.
 *
 * The output is a small structured record that engines map onto the
 * OS-specific `RiskFlagInput` shape — this file does NOT depend on the
 * Health repo or risk-flag types so other OSes can re-use it cleanly.
 */

export interface MoodDeltaRecord {
  /** Optional log identifier — purely for the matched-list payload. */
  id?: string;
  /** ISO timestamp of when the entry was completed/observed. */
  at: string | Date;
  /** Pre-event mood (1..10). */
  moodBefore: number | null | undefined;
  /** Post-event mood (1..10). */
  moodAfter: number | null | undefined;
}

export interface MoodDropOpts {
  /** Window in days to consider. Default: 7. */
  windowDays?: number;
  /** Magnitude (>=) of mood drop that counts as bad. Default: 3. */
  dropMagnitude?: number;
  /** Minimum count of bad logs in window. Default: 3. */
  threshold?: number;
  /** Reference "now" — pass a stable date in tests. */
  now?: Date;
}

export interface MoodDropResult {
  /** True if the drop pattern fired. */
  triggered: boolean;
  /** Number of qualifying logs in the window. */
  matchCount: number;
  /** IDs of the qualifying logs (when supplied via input.id). */
  matchIds: string[];
  /** Window the detector considered, in ISO. */
  windowStart: string;
  windowEnd: string;
  /** Threshold actually used. */
  threshold: number;
  /** Drop magnitude actually used. */
  dropMagnitude: number;
}

/**
 * Detect a mood-drop pattern across recent logs.
 *
 * Returns a `MoodDropResult` regardless of whether the pattern fired —
 * callers can render `triggered=false` as a "calm" indicator if they
 * want, or simply gate on `triggered === true` to emit a flag.
 */
export function detectMoodDropPattern(
  logs: MoodDeltaRecord[],
  opts: MoodDropOpts = {},
): MoodDropResult {
  const windowDays = opts.windowDays ?? 7;
  const dropMagnitude = opts.dropMagnitude ?? 3;
  const threshold = opts.threshold ?? 3;
  const now = opts.now ?? new Date();
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const matchIds: string[] = [];
  let matchCount = 0;
  for (const log of logs) {
    if (
      typeof log.moodBefore !== 'number' ||
      typeof log.moodAfter !== 'number'
    )
      continue;
    const at = log.at instanceof Date ? log.at : new Date(log.at);
    if (Number.isNaN(at.getTime())) continue;
    if (at < windowStart || at > windowEnd) continue;
    const drop = log.moodBefore - log.moodAfter;
    if (drop >= dropMagnitude) {
      matchCount += 1;
      if (log.id) matchIds.push(log.id);
    }
  }

  return {
    triggered: matchCount >= threshold,
    matchCount,
    matchIds,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    threshold,
    dropMagnitude,
  };
}
