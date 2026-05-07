import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { invalidateSession } from '@platform/auth';
import { clearSessionCookie, getSessionToken } from '@platform/auth/cookies';
import { Pool } from 'pg';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 5 });
  }
  return _pool;
}

export async function POST(_req: NextRequest) {
  const cookieStore = await cookies();
  const token = getSessionToken(cookieStore as any);

  if (token) {
    try {
      await invalidateSession(token, getPool());
    } catch {
      // Best-effort: clear cookie regardless
    }
  }

  clearSessionCookie(cookieStore as any);

  return NextResponse.redirect(new URL('/login', _req.url), { status: 303 });
}
