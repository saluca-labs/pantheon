import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { hashPassword, verifyPassword, createSession } from '@platform/auth';
import { setSessionCookie, type MutableCookieStore } from '@platform/auth/cookies';

/**
 * JSON-based login endpoint, complementing the React server-action flow
 * at /(auth)/login. Used by the smoke test harness and programmatic clients.
 *
 * Request:  { email: string, password: string }
 * Response: 200 { userId: string } and a session cookie set, or 401 on bad creds.
 */

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 5 });
  }
  return _pool;
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const email = body.email?.toLowerCase().trim();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const db = getPool();
  const result = await db.query<{ id: string; hash: string }>(
    `SELECT u.id, pc.hash
     FROM users u
     JOIN password_credentials pc ON pc.user_id = u.id
     WHERE u.email = $1`,
    [email],
  );
  const row = result.rows[0];
  if (!row) {
    // Constant-time: still hash to avoid timing leaks.
    await hashPassword('dummy-constant-time');
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const ok = await verifyPassword(row.hash, password);
  if (!ok) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const session = await createSession(row.id, db, {
    ipAddress: undefined,
    userAgent: undefined,
  });

  const response = NextResponse.json({ userId: row.id }, { status: 200 });
  setSessionCookie(response.cookies as MutableCookieStore, session.token);
  return response;
}
