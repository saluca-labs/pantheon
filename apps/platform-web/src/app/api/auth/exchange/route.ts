/**
 * GET /api/auth/exchange
 *
 * Token exchange BFF — bridges a portal-issued `tiresias_session` (opaque
 * SoulAuth token) into a platform-web `platform_session` (locally-issued
 * via createSession() against platform-web's Postgres).
 *
 * Architectural intent:
 *   Portal stays the canonical IdP (issues tiresias_session against SoulAuth)
 *   Platform-web stays the relying party (mints platform_session for local
 *   DB-backed validation perf, RBAC, BFF-internal contracts)
 *
 * Federation flow:
 *   1. Read tiresias_session cookie. Absent → 401.
 *   2. Verify it against SoulAuth /v1/auth/local/session/verify. Invalid → 401.
 *   3. Upsert local users row keyed by email (UNIQUE in schema). The local
 *      row carries no password_credentials — federated identity only.
 *   4. createSession(userId) → mints fresh platform_session token + DB row.
 *   5. Set platform_session cookie.
 *   6. If ?returnTo=<path> is present and same-origin, 303 there;
 *      otherwise 200 JSON { ok: true, userId }.
 *
 * Notes:
 *   - We do NOT change validateSession() — downstream BFF routes keep using
 *     the platform_session validator exactly as-is.
 *   - We do NOT touch portal code. Portal keeps issuing tiresias_session.
 *   - We do NOT call SoulAuth's /v1/auth/local/login — exchange runs
 *     against an existing SoulAuth session, not against credentials.
 *   - We use the existing `email UNIQUE` column as the federation join key.
 *     A future migration could add `external_id` for SoulAuth subject
 *     mapping if email-collision across IdPs ever becomes a concern.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { createSession, verifyTiresiasSession } from '@platform/auth';
import { setSessionCookie } from '@platform/auth/cookies';

const TIRESIAS_SESSION_COOKIE = 'tiresias_session';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 5 });
  }
  return _pool;
}

/**
 * Resolve a safe redirect target from a returnTo query param.
 *
 * Only same-origin paths are honored. We require the value to start with `/`
 * and reject `//` (protocol-relative URLs). External URLs are dropped.
 */
function safeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  // Reject anything that smuggles a scheme via backslash, etc.
  if (raw.includes('\\')) return null;
  return raw;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. Read tiresias_session cookie
  const tiresiasToken = request.cookies.get(TIRESIAS_SESSION_COOKIE)?.value;
  if (!tiresiasToken) {
    return NextResponse.json(
      { error: 'no_tiresias_session' },
      { status: 401 }
    );
  }

  // 2. Verify against SoulAuth
  const identity = await verifyTiresiasSession(tiresiasToken);
  if (!identity) {
    return NextResponse.json(
      { error: 'tiresias_session_invalid' },
      { status: 401 }
    );
  }

  // 3. Upsert local users row keyed by email (UNIQUE).
  //    No password_credentials row — federated identity has no local password.
  //    We treat email as the natural federation key; SoulAuth is authoritative
  //    on the email address it returns.
  const db = getPool();
  let userId: string;
  try {
    const upsert = await db.query<{ id: string }>(
      `INSERT INTO users (email, display_name, email_verified)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (email) DO UPDATE
         SET updated_at = NOW()
       RETURNING id`,
      [identity.email.toLowerCase(), identity.email.split('@')[0] ?? null]
    );
    const row = upsert.rows[0];
    if (!row) {
      throw new Error('upsert returned no row');
    }
    userId = row.id;
  } catch (err) {
    console.error('[auth/exchange] user upsert failed:', err);
    return NextResponse.json(
      { error: 'exchange_failed' },
      { status: 500 }
    );
  }

  // 4. Mint a fresh platform_session
  let sessionToken: string;
  try {
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    const userAgent = request.headers.get('user-agent') ?? undefined;
    const session = await createSession(userId, db, { ipAddress, userAgent });
    sessionToken = session.token;
  } catch (err) {
    console.error('[auth/exchange] createSession failed:', err);
    return NextResponse.json(
      { error: 'exchange_failed' },
      { status: 500 }
    );
  }

  // 5. Build response — redirect if returnTo is present and same-origin,
  //    otherwise plain JSON ack.
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));

  const response = returnTo
    ? NextResponse.redirect(new URL(returnTo, request.url), 303)
    : NextResponse.json({ ok: true, userId }, { status: 200 });

  // 6. Set platform_session cookie via the canonical helper
  setSessionCookie(response.cookies as never, sessionToken);

  return response;
}
