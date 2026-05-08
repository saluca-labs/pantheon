/**
 * Secure-Dev OS session helper.
 *
 * Re-exports shared session utilities from Health OS.
 *
 * @license MIT — Tiresias Secure-Dev OS (internal).
 */

export {
  getCurrentHealthUser as getCurrentSecureDevUser,
  getHealthPool as getSecureDevPool,
} from '../health/session';

export type { HealthSessionUser as SecureDevSessionUser } from '../health/session';
