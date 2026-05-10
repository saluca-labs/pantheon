/**
 * Crisis-language post-filter for the coach's streamed reply.
 *
 * Subscribes to the assistant's text deltas, accumulates the full reply,
 * and runs `detectCrisisLanguage` whenever the accumulator grows. On a
 * match it:
 *   1. Persists a risk flag via the supplied callback (non-blocking).
 *   2. Returns the match result so the chat route can set
 *      `crisis_detected=true` on the assistant message row.
 *
 * The filter does NOT block emission and does NOT redact tokens. The
 * coach's own system prompt is responsible for surfacing the 988
 * referral; this layer is a safety net.
 */

import 'server-only';
import { detectCrisisLanguage } from '../../_shared/safety/crisis-guard';
import type { RiskFlagInput } from '../../_shared/types';

export interface CrisisStreamMonitorInput {
  /** Persist a risk flag when crisis language is observed. */
  persistFlag: (flag: RiskFlagInput) => Promise<void>;
  /** Identifies the call site for the flag's `source` field. */
  source: string;
}

export interface CrisisMonitor {
  /** Feed a delta from the model. Returns whether *this* delta tipped the cumulative text into a crisis match. */
  ingest: (delta: string) => boolean;
  /** Read the current detection state (after the stream has fully drained). */
  result: () => { matched: boolean; matches: string[] };
}

/**
 * Build a monitor that callers attach to `streamText`'s `onChunk` (or
 * iterate `textStream` and forward each delta into).
 *
 * The first time a crisis pattern matches the accumulated text, the
 * monitor fires `persistFlag` once (subsequent matches are suppressed to
 * avoid duplicate flags in the same turn).
 */
export function createCrisisMonitor(
  input: CrisisStreamMonitorInput,
): CrisisMonitor {
  let buffer = '';
  let fired = false;
  let lastMatches: string[] = [];

  function ingest(delta: string): boolean {
    if (!delta) return false;
    buffer += delta;
    const r = detectCrisisLanguage(buffer);
    if (r.matched) {
      lastMatches = r.matches;
      if (!fired) {
        fired = true;
        const flag: RiskFlagInput = {
          kind: 'crisis-language',
          severity: r.severity ?? 'critical',
          source: input.source,
          payload: { matches: r.matches, sample: buffer.slice(0, 240) },
        };
        // Fire-and-forget; do not block the stream.
        void input.persistFlag(flag).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[coach-crisis-monitor] flag persistence failed', err);
        });
        return true;
      }
    }
    return false;
  }

  return {
    ingest,
    result: () => ({ matched: fired, matches: lastMatches }),
  };
}
