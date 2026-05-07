'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { hashPassword, verifyPassword, createSession } from '@platform/auth';
import { setSessionCookie } from '@platform/auth/cookies';
import { Pool } from 'pg';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 5 });
  }
  return _pool;
}

async function loginAction(formData: FormData) {
  'use server';

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) return;

  const db = getPool();
  // Look up user + password credential
  const result = await db.query<{ id: string; hash: string }>(
    `SELECT u.id, pc.hash
     FROM users u
     JOIN password_credentials pc ON pc.user_id = u.id
     WHERE u.email = $1`,
    [email]
  );

  const row = result.rows[0];
  if (!row) {
    // Constant-time: still run verify to avoid timing leaks
    await hashPassword('dummy-constant-time');
    redirect('/login?error=invalid');
  }

  const valid = await verifyPassword(row.hash, password);
  if (!valid) {
    redirect('/login?error=invalid');
  }

  const session = await createSession(row.id, db, {
    ipAddress: undefined,
    userAgent: undefined,
  });

  const cookieStore = await cookies();
  setSessionCookie(cookieStore as any, session.token);
  redirect('/dashboard');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const hasError = params.error === 'invalid';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117]">
      <div className="w-full max-w-md p-8 rounded-xl bg-[#1a1d27] border border-[#2a2d3e] shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Tiresias</h1>
          <p className="text-sm text-[#94a3b8]">Governance-First AI-Security&#8482;</p>
        </div>

        {hasError && (
          <div className="mb-4 p-3 rounded-lg bg-[#E17055]/10 border border-[#E17055]/30 text-[#E17055] text-sm text-center">
            Invalid email or password.
          </div>
        )}

        <form action={loginAction} className="space-y-4">
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
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full h-10 rounded-lg bg-[#0f1117] border border-[#2a2d3e] text-white px-3 text-sm focus:outline-none focus:border-[#4361EE] placeholder-[#4a4d5e]"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="flex items-center justify-center w-full h-12 rounded-lg bg-[#4361EE] text-white font-medium hover:bg-[#3651DE] transition-colors"
          >
            Sign in
          </button>
        </form>

        <div className="mt-4 text-center">
          <a href="/register" className="text-xs text-[#4361EE] hover:underline">
            Create account
          </a>
          {' · '}
          <a href="/forgot-password" className="text-xs text-[#4361EE] hover:underline">
            Forgot password?
          </a>
        </div>

        <p className="mt-6 text-center text-xs text-[#94a3b8]">
          &copy; {new Date().getFullYear()} Saluca LLC. All rights reserved.
        </p>
      </div>
    </div>
  );
}
