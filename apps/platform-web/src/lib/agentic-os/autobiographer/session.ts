/**
 * Autobiographer OS — session helpers.
 *
 * Re-exports the shared session utility from Health OS so every vertical OS
 * uses a single, tested session layer rather than duplicating cookie logic.
 *
 * @license MIT — see /LICENSE
 * @see https://nextjs.org/docs/app/api-reference/functions/cookies (Next.js cookies API, MIT)
 */

export {
  getCurrentHealthUser as getCurrentAutobiographerUser,
  getHealthPool as getAutobiographerPool,
} from '../health/session';

export type { HealthSessionUser as AutobiographerSessionUser } from '../health/session';
