/**
 * Research coach — public domain re-exports.
 *
 * Thin barrel: callers that need only the types or the mode taxonomy
 * import from here. Database calls flow through `./sessions-repo`.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

export type {
  CoachMessage,
  CoachMessageRole,
  CoachSession,
  CreateSessionInput,
  ListSessionsInput,
  UpdateSessionInput,
} from './sessions-repo';

export {
  COACH_MESSAGE_ROLE_VALUES,
  autoTitle,
} from './sessions-repo';

export {
  COACH_MODE_VALUES,
  COACH_MODE_LABELS,
  COACH_MODE_DESCRIPTIONS,
  COACH_MODE_STARTERS,
  EXPERIMENT_REQUIRED_MODES,
  isCoachMode,
  modeRequiresExperiment,
} from './modes';
export type { CoachMode } from './modes';
