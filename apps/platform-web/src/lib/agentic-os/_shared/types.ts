/**
 * Cross-OS shared types for the Agentic OS verticals.
 *
 * The `_shared/` tree is for primitives every OS reuses: audit, safety,
 * common types. OS-specific repos and engines live under
 * `lib/agentic-os/<slug>/`. Anything broader than a single OS belongs
 * here.
 *
 * @license MIT — Tiresias platform (internal).
 */

export type RiskFlagSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Input shape used by risk-flag engines (intake, screener, free-text) to
 * propose a flag. The repo persists by adding `id`, `tenant_id`,
 * `created_at`, etc. — engines never write directly.
 */
export interface RiskFlagInput {
  kind: string;
  severity: RiskFlagSeverity;
  source: string;
  payload?: Record<string, unknown>;
}

/**
 * Per-OS audit action tag. Convention: `<slug>.<entity>.<verb>`,
 * e.g. `health.mh_profile.upserted` or `health.consent.granted`.
 */
export type AuditAction = string;

/**
 * Common context object passed to repos that need the acting user and
 * tenant in one bundle. Routes resolve these from the session before
 * calling into repo / engine code.
 */
export interface OsContext {
  userId: string;
  tenantId: string;
}
