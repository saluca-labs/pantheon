/**
 * CyberSec OS — session helpers.
 *
 * Re-exports the shared OS session utility under Cyber-flavoured names.
 * The session/auth machinery is identical across every vertical, so the real
 * implementation lives in `../_shared/session`.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

export {
  getCurrentOsUser as getCurrentCyberUser,
  getOsPool as getCyberPool,
} from '../_shared/session';

export type { OsSessionUser as CyberSessionUser } from '../_shared/session';
