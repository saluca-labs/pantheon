/**
 * Maker OS session helper.
 *
 * Re-exports the shared session utilities from Health OS so we don't
 * duplicate cookie/pool logic. The alias `getCurrentMakerUser` is a
 * thin rename for clarity in Maker OS code paths.
 *
 * @license MIT — original session pattern from Tiresias Health OS (internal).
 */

export {
  getCurrentHealthUser as getCurrentMakerUser,
  getHealthPool as getMakerPool,
} from '../health/session';

export type { HealthSessionUser as MakerSessionUser } from '../health/session';
