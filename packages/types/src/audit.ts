/**
 * Audit event types.
 */

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.register'
  | 'auth.password_reset_request'
  | 'auth.password_reset_complete'
  | 'auth.login_failed'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'org.created'
  | 'org.updated'
  | 'org.member_added'
  | 'org.member_removed'
  | 'session.created'
  | 'session.invalidated';

export interface AuditEvent {
  id: string;
  action: AuditAction;
  actorId: string | null;
  targetId: string | null;
  targetType: string | null;
  organizationId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
