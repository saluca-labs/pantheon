/**
 * Audit viewer session helper.
 *
 * Re-exports the shared session utilities under audit-specific names so the
 * audit BFF / UI imports read clearly. Keeps cookie + pool plumbing in one
 * place (Health OS), avoiding duplication.
 *
 * @license MIT — Tiresias platform (internal).
 */

export {
  getCurrentHealthUser as getCurrentAuditUser,
  getHealthPool as getAuditPool,
} from '../health/session';

export type { HealthSessionUser as AuditSessionUser } from '../health/session';
