/**
 * Structured audit event emitter.
 *
 * Writes events to the audit_events table. Import the logger separately
 * if you also want console output.
 */

import type { DB } from './types.js';

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.register'
  | 'auth.login_failed'
  | 'auth.password_reset_request'
  | 'auth.password_reset_complete'
  | 'session.created'
  | 'session.invalidated';

export interface AuditEventInput {
  action: AuditAction;
  actorId?: string | null;
  targetId?: string | null;
  targetType?: string | null;
  organizationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Emit an audit event to the database.
 * Non-throwing — logs to stderr on failure to avoid disrupting auth flows.
 */
export async function emitAuditEvent(
  event: AuditEventInput,
  db: DB
): Promise<void> {
  try {
    await (db as any).query(
      `INSERT INTO audit_events
         (action, actor_id, target_id, target_type, organization_id,
          ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.action,
        event.actorId ?? null,
        event.targetId ?? null,
        event.targetType ?? null,
        event.organizationId ?? null,
        event.ipAddress ?? null,
        event.userAgent ?? null,
        JSON.stringify(event.metadata ?? {}),
      ]
    );
  } catch (err) {
    console.error('[audit] Failed to write audit event:', err);
  }
}
