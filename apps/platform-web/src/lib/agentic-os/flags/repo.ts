/**
 * Agentic OS feature flags — database repository.
 *
 * Stores per-user boolean toggles in `agos_feature_flags` (migration
 * 0013_agos_feature_flags, chained off 0012_filmmaker_projects).
 * Default state for every OS is `enabled = true`; missing rows are treated
 * as enabled.
 *
 * @license MIT — Tiresias Agentic OS (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getHealthPool } from '../health/session';
import { AGENTIC_OS_MODULES } from '../registry';

/** All known OS slugs derived from the registry (single source of truth). */
export const ALL_SLUGS: readonly string[] = AGENTIC_OS_MODULES.map(
  (m) => m.slug,
);

/**
 * Return the full flag map for a user.
 * Missing rows default to `true` (enabled).
 */
export async function getFlags(
  userId: string,
): Promise<Record<string, boolean>> {
  const pool = getHealthPool();
  const r = await pool.query<{ os_slug: string; enabled: boolean }>(
    `SELECT os_slug, enabled
       FROM agos_feature_flags
      WHERE user_id = $1`,
    [userId],
  );

  // Seed all slugs as true, then overwrite with stored values.
  const flags: Record<string, boolean> = {};
  for (const slug of ALL_SLUGS) {
    flags[slug] = true;
  }
  for (const row of r.rows) {
    if (row.os_slug in flags) {
      flags[row.os_slug] = row.enabled;
    }
  }
  return flags;
}

/**
 * Upsert a single feature flag for a user.
 * Throws if `slug` is not in the registry.
 */
export async function setFlag(
  userId: string,
  slug: string,
  enabled: boolean,
): Promise<void> {
  if (!(ALL_SLUGS as string[]).includes(slug)) {
    throw new Error(`Unknown OS slug: "${slug}". Valid slugs: ${ALL_SLUGS.join(', ')}`);
  }

  const pool = getHealthPool();
  await pool.query(
    `INSERT INTO agos_feature_flags (user_id, os_slug, enabled, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, os_slug) DO UPDATE
       SET enabled    = EXCLUDED.enabled,
           updated_at = now()`,
    [userId, slug, enabled],
  );
}

/**
 * Record a flag-change in the shared audit log.
 * `os_slug` is set to `'flags'` (the feature-flags subsystem) to avoid
 * colliding with per-OS audit entries.
 */
export async function recordFlagsAudit(args: {
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const pool = getHealthPool();
  await pool.query(
    `INSERT INTO agos_audit (id, actor_id, os_slug, action, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      randomUUID(),
      args.actorId,
      'flags',
      args.action,
      JSON.stringify(args.payload ?? {}),
    ],
  );
}
