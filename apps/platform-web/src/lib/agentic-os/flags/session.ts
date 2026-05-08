/**
 * Feature flags — session helper.
 *
 * Re-exports the shared session utility from Maker OS under a flags-specific
 * alias so that flag-related code paths have a self-documenting import.
 * All per-OS session helpers are identical under the hood — they all read
 * the same `platform_session` cookie and validate it against the same pool.
 *
 * @license MIT — Tiresias Agentic OS (internal).
 */

export {
  getCurrentMakerUser as getCurrentFlagsUser,
  getMakerPool as getFlagsPool,
} from '../maker/session';

export type { MakerSessionUser as FlagsSessionUser } from '../maker/session';
