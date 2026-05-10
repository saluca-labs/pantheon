/**
 * Filmmaker OS — session helpers.
 *
 * Re-exports the shared OS session utility under Filmmaker-flavoured names.
 * The session/auth machinery is identical across every vertical, so the real
 * implementation lives in `../_shared/session`.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

export {
  getCurrentOsUser as getCurrentFilmmakerUser,
  getOsPool as getFilmmakerPool,
} from '../_shared/session';

export type { OsSessionUser as FilmmakerSessionUser } from '../_shared/session';
