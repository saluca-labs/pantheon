/**
 * Research OS session helper.
 *
 * Re-exports the shared session utilities from Health OS so we don't
 * duplicate cookie/pool logic.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

export {
  getCurrentHealthUser as getCurrentResearchUser,
  getHealthPool as getResearchPool,
} from '../health/session';

export type { HealthSessionUser as ResearchSessionUser } from '../health/session';
