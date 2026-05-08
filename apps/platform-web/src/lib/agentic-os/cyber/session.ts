/**
 * CyberSec OS session helper.
 *
 * Re-exports shared session utilities from Health OS.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

export {
  getCurrentHealthUser as getCurrentCyberUser,
  getHealthPool as getCyberPool,
} from '../health/session';

export type { HealthSessionUser as CyberSessionUser } from '../health/session';
