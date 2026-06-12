/**
 * Temporal decay and access-frequency boost for hybrid search scoring.
 *
 * Agent memories are unlike static documents — they lose salience over time
 * but gain importance through repeated access. These two signals combine
 * into a score modifier applied after RRF fusion.
 *
 * Decay follows an exponential curve (like radioactive half-life).
 * Boost follows a logarithmic scale (like spaced repetition).
 * Together they approximate the "activation strength" model from ACT-R cognitive
 * architecture.
 */

/** Controls how fast memories decay. 0.05 ≈ 60% weight remaining after 10 days. */
const DECAY_LAMBDA = 0.05

/**
 * Exponential temporal decay based on memory age.
 * Returns a multiplier in (0, 1].
 */
export function temporalDecay(createdAt: string): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000
  return Math.exp(-DECAY_LAMBDA * Math.max(0, ageDays))
}

/**
 * Access-frequency boost using log2 scale.
 * Returns a multiplier >= 1.0.
 *
 * recall_count:  0 → 1.00x
 *                1 → 1.25x
 *                7 → 1.75x
 *               63 → 2.50x
 */
export function accessBoost(recallCount: number): number {
  return 1 + Math.log2(1 + recallCount) / 4
}

/**
 * Combined score modifier: temporalDecay × accessBoost.
 * Apply to RRF scores before final ranking.
 */
export function scoreModifier(createdAt: string, recallCount: number): number {
  return temporalDecay(createdAt) * accessBoost(recallCount)
}

// ── M2: activation-gated, testing-effect memory (flag-gated) ──────────────────
// Enabled with MEMORY_M2_ENABLED=true. When off, scoreModifierFor() is exactly M1.
//
// The two changes M2 makes over M1 (see glass-brain-bench benchmarks 01–02):
//   1. Decay is measured from the LAST RECALL, not creation — a successful recall
//      reinstates the trace (the testing effect), so rehearsal sustains a memory.
//   2. The stability gained from a recall is gated on how retrievable the memory
//      was at that moment (gain ∝ R·(1−R), maximal at R=0.5) — which is what
//      produces the spacing effect and its nonmonotonic optimal lag.
// Both require per-memory `stability` + `last_recall_at` (added by the adapters).

/** Initial stability (half-life, days). Matches M1's ~14-day half-life (ln2/0.05). */
export const M2_H0_DAYS = 14
/** Max corroboration strength factor. */
export const M2_F = 3
export const M2_ENABLED = process.env.MEMORY_M2_ENABLED === 'true'

/** Retrievability in (0,1]: halves every `stabilityDays` since the last recall. */
export function retrievability(stabilityDays: number, lastRecallAt: string): number {
  const days = (Date.now() - new Date(lastRecallAt).getTime()) / 86_400_000
  return Math.pow(2, -Math.max(0, days) / Math.max(1e-6, stabilityDays))
}

/** New stability after a recall: gated on retrievability-at-recall (∝ R·(1−R)). */
export function stabilityAfterRecall(stabilityDays: number, lastRecallAt: string): number {
  const R = retrievability(stabilityDays, lastRecallAt)
  return stabilityDays * (1 + (M2_F - 1) * R * (1 - R))
}

/**
 * Score modifier with safe M2 fallback. Uses the M2 retrievability factor when
 * the flag is on AND the memory carries stability + last_recall_at; otherwise
 * falls back to the M1 scoreModifier. Safe to call on any memory (adapters that
 * don't surface the M2 columns simply keep M1 behavior).
 */
export function scoreModifierFor(m: {
  created_at: string
  recall_count: number
  stability?: number | null
  last_recall_at?: string | null
}): number {
  if (M2_ENABLED && m.stability != null && m.last_recall_at != null) {
    return retrievability(m.stability, m.last_recall_at)
  }
  return scoreModifier(m.created_at, m.recall_count)
}
