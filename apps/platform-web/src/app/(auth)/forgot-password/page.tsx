'use server';

import { redirect } from 'next/navigation';
import crypto from 'node:crypto';
import { Pool } from 'pg';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 5 });
  }
  return _pool;
}

async function requestResetAction(formData: FormData) {
  'use server';

  const email = (formData.get('email') as string)?.toLowerCase().trim();
  if (!email) redirect('/forgot-password?error=invalid');

  const db = getPool();
  const userResult = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  const userId = userResult.rows[0]?.id;

  if (userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    );

    // In dev, log the reset URL to stdout (mailhog sends the email in full stack)
    const resetUrl = `${process.env['WEB_PUBLIC_URL'] ?? 'http://localhost:3000'}/reset-password?token=${token}`;
    if (process.env['NODE_ENV'] !== 'production') {
      console.log(`[dev] Password reset link for ${email}: ${resetUrl}`);
    }

    // TODO: Send via SMTP/mailhog in dev, transactional mailer in prod
  }

  // Always redirect to the same confirmation page — don't leak user existence
  redirect('/forgot-password?sent=1');
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;

  if (params.sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1117]">
        <div className="w-full max-w-md p-8 rounded-xl bg-[#1a1d27] border border-[#2a2d3e] shadow-2xl text-center">
          <h1 className="text-2xl font-bold text-white mb-3">Check your email</h1>
          <p className="text-[#94a3b8] text-sm">
            If an account exists for that email, you&apos;ll receive a reset link shortly.
          </p>
          <a href="/login" className="mt-6 inline-block text-xs text-[#4361EE] hover:underline">
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117]">
      <div className="w-full max-w-md p-8 rounded-xl bg-[#1a1d27] border border-[#2a2d3e] shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Reset password</h1>
          <p className="text-sm text-[#94a3b8]">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>

        <form action={requestResetAction} className="space-y-4">
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

          <button
            type="submit"
            className="flex items-center justify-center w-full h-12 rounded-lg bg-[#4361EE] text-white font-medium hover:bg-[#3651DE] transition-colors"
          >
            Send reset link
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-[#94a3b8]">
          <a href="/login" className="text-[#4361EE] hover:underline">Back to sign in</a>
        </p>
      </div>
    </div>
  );
}
