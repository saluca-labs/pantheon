/**
 * Cross-OS audit-log writer.
 *
 * The `agos_audit` table from migration 0003_agentic_os.py is the single
 * write target for every Agentic OS BFF mutation. Each OS used to ship
 * its own thin wrapper (`recordAudit` in `lib/agentic-os/<slug>/repo.ts`);
 * this module replaces that pattern with a slug-parameterized writer
 * that all OSes can call directly.
 *
 * Phase 1 of Health OS migrates only Health to call this; other OSes are
 * left unchanged and will migrate in their own phase to keep diffs small.
 *
 * @license MIT — Tiresias platform (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuditAction } from './types';

export interface RecordAuditArgs {
  pool: Pool;
  osSlug: string;
  actorId: string;
  action: AuditAction;
  payload?: Record<string, unknown>;
  projectId?: string | null;
}

/**
 * Append a row to `agos_audit`. The pool is passed in so callers can
 * keep their existing per-OS connection pool without this module needing
 * to know how each OS resolves a Pg client.
 */
export async function recordAudit(args: RecordAuditArgs): Promise<void> {
  await args.pool.query(
    `INSERT INTO agos_audit (id, project_id, actor_id, os_slug, action, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      randomUUID(),
      args.projectId ?? null,
      args.actorId,
      args.osSlug,
      args.action,
      JSON.stringify(args.payload ?? {}),
    ],
  );
}
