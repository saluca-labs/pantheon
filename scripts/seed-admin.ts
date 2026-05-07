#!/usr/bin/env tsx
/**
 * Seed admin user for local development.
 *
 * Creates a default admin@local user with a randomly generated password.
 * Refuses to run in production.
 *
 * Usage:
 *   npx tsx scripts/seed-admin.ts
 *   Or via bootstrap.sh
 */

import { Pool } from 'pg';
import crypto from 'node:crypto';

const NODE_ENV = process.env['NODE_ENV'] ?? 'development';
const DATABASE_URL = process.env['DATABASE_URL'];

if (NODE_ENV === 'production') {
  console.error('[seed-admin] Refusing to seed in production. Exiting.');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('[seed-admin] DATABASE_URL is required. Set it in .env');
  process.exit(1);
}

const ADMIN_EMAIL = process.env['ADMIN_EMAIL'] ?? 'admin@local';
const ADMIN_PASSWORD = process.env['ADMIN_PASSWORD'] ?? crypto.randomBytes(16).toString('hex');

async function main() {
  // Lazy import argon2 to avoid hard dep at bootstrap time
  let argon2: typeof import('argon2');
  try {
    argon2 = await import('argon2');
  } catch {
    console.error('[seed-admin] argon2 package not installed. Run: pnpm install');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

  try {
    // Check if admin already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
    if ((existing.rowCount ?? 0) > 0) {
      console.log(`[seed-admin] Admin user ${ADMIN_EMAIL} already exists. Skipping.`);
      return;
    }

    const hash = await argon2.hash(ADMIN_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, email_verified)
         VALUES ($1, 'Admin', true)
         RETURNING id`,
        [ADMIN_EMAIL]
      );
      const userId = userResult.rows[0]?.id;
      if (!userId) throw new Error('User insert failed');

      await client.query(
        `INSERT INTO password_credentials (user_id, hash) VALUES ($1, $2)`,
        [userId, hash]
      );

      await client.query('COMMIT');

      console.log(`[seed-admin] ✓ Created admin user`);
      console.log(`[seed-admin]   Email:    ${ADMIN_EMAIL}`);
      console.log(`[seed-admin]   Password: ${ADMIN_PASSWORD}`);
      console.log(`[seed-admin]   ⚠️  Save this password — it will not be shown again.`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed-admin] Fatal error:', err);
  process.exit(1);
});
