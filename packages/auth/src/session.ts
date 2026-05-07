/**
 * Session management backed by Postgres.
 */

import crypto from 'node:crypto';
import type { DB, Session, SessionWithUser } from './types.js';

const SESSION_TTL_DAYS = 30;

function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

interface SessionRow {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

interface SessionWithUserRow extends SessionRow {
  user_id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  organizationId: string | null;
  user_createdAt: Date;
  user_updatedAt: Date;
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

  const result = await db.query(
    `INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id AS "userId", token, expires_at AS "expiresAt",
               created_at AS "createdAt", ip_address AS "ipAddress",
               user_agent AS "userAgent"`,
    [userId, token, expiresAt, meta?.ipAddress ?? null, meta?.userAgent ?? null]
  );

  const row = (result.rows as SessionRow[])[0];
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
  const result = await db.query(
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

  const row = (result.rows as SessionWithUserRow[])[0];
  if (!row) return null;

  return {
    session: {
      id: row.id,
      userId: row.userId,
      token: row.token,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
    },
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.displayName,
      emailVerified: row.emailVerified,
      organizationId: row.organizationId,
      createdAt: row.user_createdAt,
      updatedAt: row.user_updatedAt,
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
  await db.query(
    `UPDATE sessions SET invalidated_at = NOW() WHERE token = $1`,
    [token]
  );
}
