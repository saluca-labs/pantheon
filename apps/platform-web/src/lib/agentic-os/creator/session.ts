/**
 * Creator OS — session helpers.
 *
 * Re-exports the shared OS session utility under Creator-flavoured names so
 * existing call sites continue to compile. New code should prefer importing
 * directly from `../_shared/session`.
 *
 * @license MIT — Tiresias platform (internal).
 */

export {
  getCurrentOsUser as getCurrentCreatorUser,
  getOsPool as getCreatorPool,
} from '../_shared/session';

export type { OsSessionUser as CreatorSessionUser } from '../_shared/session';
