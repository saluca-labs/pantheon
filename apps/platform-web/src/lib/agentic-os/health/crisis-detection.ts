/**
 * Health OS crisis-language detector.
 *
 * As of Phase 1, the rule-based detector lives at
 * `lib/agentic-os/_shared/safety/crisis-guard.ts` so other OSes (and the
 * journal / coach Phase 2 surfaces) can reuse it. This module is a thin
 * re-export kept for backwards compatibility with callers that imported
 * the pre-Phase-1 path.
 */

export { detectCrisisLanguage } from '../_shared/safety/crisis-guard';
export type { CrisisDetection } from '../_shared/safety/crisis-guard';
