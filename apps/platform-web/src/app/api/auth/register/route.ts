import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { hashPassword, createSession } from '@platform/auth';
import { setSessionCookie, type MutableCookieStore } from '@platform/auth/cookies';

/**
 * JSON-based registration endpoint, complementing the React server-action
 * flow at /(auth)/register. Used by the smoke test harness and programmatic
 * clients.
 *
 * Request:  { email: string, password: string, displayName?: string }
 * Response: 201 { userId: string } and a session cookie set
 */

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 5 });
  }
  return _pool;
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const email = body.email?.toLowerCase().trim();
  const password = body.password;
  const displayName = body.displayName?.trim() || null;

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { error: 'invalid', detail: 'email + password (min 8 chars) required' },
      { status: 400 },
    );
  }

  const db = getPool();
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if ((existing.rowCount ?? 0) > 0) {
    return NextResponse.json({ error: 'exists' }, { status: 409 });
  }

  const hash = await hashPassword(password);
  const client = await db.connect();
  let userId: string;
  try {
    await client.query('BEGIN');
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, displayName],
    );
    userId = userResult.rows[0]?.id ?? '';
    if (!userId) throw new Error('user insert failed');

    await client.query(
      `INSERT INTO password_credentials (user_id, hash) VALUES ($1, $2)`,
      [userId, hash],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return NextResponse.json(
      { error: 'server', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  } finally {
    client.release();
  }

  const session = await createSession(userId, db);

  const response = NextResponse.json({ userId }, { status: 201 });
  setSessionCookie(response.cookies as MutableCookieStore, session.token);
  return response;
}
