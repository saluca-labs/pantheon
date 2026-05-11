/**
 * Maker OS — session helpers.
 *
 * Re-exports the shared OS session utility under Maker-flavoured names.
 * The session/auth machinery is identical across every vertical, so the real
 * implementation lives in `../_shared/session`.
 *
 * Phase 1 (v0.1.29) switched the source from `../health/session` to
 * `../_shared/session` — matches Filmmaker / Cyber and unblocks Health from
 * carrying every other OS's session coupling.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

export {
  getCurrentOsUser as getCurrentMakerUser,
  getOsPool as getMakerPool,
} from '../_shared/session';

export type { OsSessionUser as MakerSessionUser } from '../_shared/session';
