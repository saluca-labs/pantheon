'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { hashPassword, createSession } from '@platform/auth';
import { setSessionCookie } from '@platform/auth/cookies';
import { Pool } from 'pg';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 5 });
  }
  return _pool;
}

async function registerAction(formData: FormData) {
  'use server';

  const email = (formData.get('email') as string)?.toLowerCase().trim();
  const password = formData.get('password') as string;
  const displayName = (formData.get('displayName') as string)?.trim() || null;

  if (!email || !password || password.length < 8) {
    redirect('/register?error=invalid');
  }

  const db = getPool();

  // Check if email already exists
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if ((existing.rowCount ?? 0) > 0) {
    redirect('/register?error=exists');
  }

  const hash = await hashPassword(password);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, displayName]
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) throw new Error('User insert failed');

    await client.query(
      `INSERT INTO password_credentials (user_id, hash) VALUES ($1, $2)`,
      [userId, hash]
    );

    await client.query('COMMIT');

    const session = await createSession(userId, db);
    const cookieStore = await cookies();
    setSessionCookie(cookieStore as any, session.token);
  } catch {
    await client.query('ROLLBACK');
    redirect('/register?error=server');
  } finally {
    client.release();
  }

  redirect('/dashboard');
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorMap: Record<string, string> = {
    invalid: 'Please provide a valid email and a password with at least 8 characters.',
    exists: 'An account with this email already exists.',
    server: 'Something went wrong. Please try again.',
  };
  const errorMsg = params.error ? errorMap[params.error] : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117]">
      <div className="w-full max-w-md p-8 rounded-xl bg-[#1a1d27] border border-[#2a2d3e] shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Create account</h1>
          <p className="text-sm text-[#94a3b8]">Tiresias — Governance-First AI-Security&#8482;</p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-[#E17055]/10 border border-[#E17055]/30 text-[#E17055] text-sm text-center">
            {errorMsg}
          </div>
        )}

        <form action={registerAction} className="space-y-4">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-[#94a3b8] mb-1">
              Name <span className="text-[#4a4d5e]">(optional)</span>
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              className="w-full h-10 rounded-lg bg-[#0f1117] border border-[#2a2d3e] text-white px-3 text-sm focus:outline-none focus:border-[#4361EE] placeholder-[#4a4d5e]"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#94a3b8] mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full h-10 rounded-lg bg-[#0f1117] border border-[#2a2d3e] text-white px-3 text-sm focus:outline-none focus:border-[#4361EE] placeholder-[#4a4d5e]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#94a3b8] mb-1">
              Password <span className="text-[#4a4d5e]">(min 8 chars)</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full h-10 rounded-lg bg-[#0f1117] border border-[#2a2d3e] text-white px-3 text-sm focus:outline-none focus:border-[#4361EE] placeholder-[#4a4d5e]"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="flex items-center justify-center w-full h-12 rounded-lg bg-[#4361EE] text-white font-medium hover:bg-[#3651DE] transition-colors"
          >
            Create account
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-[#94a3b8]">
          Already have an account?{' '}
          <a href="/login" className="text-[#4361EE] hover:underline">Sign in</a>
        </p>

        <p className="mt-6 text-center text-xs text-[#94a3b8]">
          &copy; {new Date().getFullYear()} Saluca LLC. All rights reserved.
        </p>
      </div>
    </div>
  );
}
