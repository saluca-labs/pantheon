/**
 * Health OS — session helpers.
 *
 * Re-exports the shared OS session utility under Health-flavoured names so
 * existing call sites continue to compile. New code should prefer importing
 * directly from `../_shared/session`.
 *
 * @license MIT — Tiresias platform (internal).
 */

export {
  getCurrentOsUser as getCurrentHealthUser,
  getOsPool as getHealthPool,
} from '../_shared/session';

export type { OsSessionUser as HealthSessionUser } from '../_shared/session';
