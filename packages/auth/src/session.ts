/**
 * Session management backed by Postgres.
 */

import crypto from 'node:crypto';
import type { DB, Session, SessionWithUser } from './types.js';

const SESSION_TTL_DAYS = 30;

function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Create a new session for a user.
 */
export async function createSession(
  userId: string,
  db: DB,
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<Session> {
  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  const result = await (db as any).query<Session>(
    `INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id AS "userId", token, expires_at AS "expiresAt",
               created_at AS "createdAt", ip_address AS "ipAddress",
               user_agent AS "userAgent"`,
    [userId, token, expiresAt, meta?.ipAddress ?? null, meta?.userAgent ?? null]
  );

  const row = result.rows[0];
  if (!row) throw new Error('Failed to create session');
  return row;
}

/**
 * Validate a session token and return the associated user + session.
 * Returns null if invalid or expired.
 */
export async function validateSession(
  token: string,
  db: DB
): Promise<SessionWithUser | null> {
  const result = await (db as any).query<SessionWithUser>(
    `SELECT
       s.id, s.user_id AS "userId", s.token, s.expires_at AS "expiresAt",
       s.created_at AS "createdAt", s.ip_address AS "ipAddress",
       s.user_agent AS "userAgent",
       u.id AS "user_id", u.email, u.display_name AS "displayName",
       u.email_verified AS "emailVerified",
       u.organization_id AS "organizationId",
       u.created_at AS "user_createdAt", u.updated_at AS "user_updatedAt"
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1
       AND s.expires_at > NOW()
       AND s.invalidated_at IS NULL`,
    [token]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    session: {
      id: (row as any).id,
      userId: (row as any).userId,
      token: (row as any).token,
      expiresAt: (row as any).expiresAt,
      createdAt: (row as any).createdAt,
      ipAddress: (row as any).ipAddress,
      userAgent: (row as any).userAgent,
    },
    user: {
      id: (row as any)['user_id'],
      email: (row as any).email,
      displayName: (row as any).displayName,
      emailVerified: (row as any).emailVerified,
      organizationId: (row as any).organizationId,
      createdAt: (row as any).user_createdAt,
      updatedAt: (row as any).user_updatedAt,
    },
  };
}

/**
 * Invalidate (log out) a session by token.
 */
export async function invalidateSession(
  token: string,
  db: DB
): Promise<void> {
  await (db as any).query(
    `UPDATE sessions SET invalidated_at = NOW() WHERE token = $1`,
    [token]
  );
}
