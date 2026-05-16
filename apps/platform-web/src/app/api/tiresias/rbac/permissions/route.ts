import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateSession } from '@platform/auth';
import { getSessionToken, type ReadableCookieStore } from '@platform/auth/cookies';
import { extractRoleFromLocalSession, checkPermission } from '@/lib/rbac/check';
import {
  Permission,
  Role,
  DEFAULT_ROLE_PERMISSIONS,
} from '@/lib/rbac/permissions';
import { Pool } from 'pg';

/**
 * BFF-local Postgres connection for permission overrides.
 * Separate from the Tiresias backend database — this is BFF state.
 */
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env['BFF_DATABASE_URL'] ?? process.env['DATABASE_URL'],
      max: 5,
    });
  }
  return pool;
}

/** Ensure the permission_overrides table exists (idempotent). */
async function ensureTable(): Promise<void> {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS permission_overrides (
      org_id TEXT NOT NULL,
      role TEXT NOT NULL,
      allowed_actions TEXT[] NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (org_id, role)
    )
  `);
}

/** Valid role and permission values for validation. */
const VALID_ROLES = new Set(Object.values(Role));
const VALID_PERMISSIONS = new Set(Object.values(Permission));

async function getLocalSession() {
  const cookieStore = await cookies();
  const token = getSessionToken(cookieStore as ReadableCookieStore);
  if (!token) return null;
  return validateSession(token, getPool());
}

/**
 * GET /api/tiresias/rbac/permissions
 *
 * Returns the effective permission map for the user's organization.
 */
export async function GET() {
  const sessionResult = await getLocalSession();
  if (!sessionResult) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const identity = extractRoleFromLocalSession(sessionResult.user);
  if (!identity.orgId) {
    return NextResponse.json(
      { error: 'No organization found for user' },
      { status: 400 },
    );
  }

  try {
    await ensureTable();
    const db = getPool();

    const result = await db.query<{
      role: string;
      allowed_actions: string[];
    }>(
      'SELECT role, allowed_actions FROM permission_overrides WHERE org_id = $1',
      [identity.orgId],
    );

    const permissions: Record<string, string[]> = {};
    for (const role of Object.values(Role)) {
      permissions[role] = [...(DEFAULT_ROLE_PERMISSIONS[role] ?? [])];
    }

    for (const row of result.rows) {
      if (VALID_ROLES.has(row.role as Role)) {
        permissions[row.role] = row.allowed_actions.filter((a) =>
          VALID_PERMISSIONS.has(a as Permission),
        );
      }
    }

    return NextResponse.json({ permissions });
  } catch {
    const permissions: Record<string, string[]> = {};
    for (const role of Object.values(Role)) {
      permissions[role] = [...(DEFAULT_ROLE_PERMISSIONS[role] ?? [])];
    }
    return NextResponse.json({ permissions });
  }
}

/**
 * POST /api/tiresias/rbac/permissions
 *
 * Saves permission overrides. Requires SETTINGS_MANAGE permission.
 */
export async function POST(request: NextRequest) {
  const sessionResult = await getLocalSession();
  if (!sessionResult) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Permission check — adapt checkPermission to local session
  const identity = extractRoleFromLocalSession(sessionResult.user);
  const allowed = (DEFAULT_ROLE_PERMISSIONS[identity.role] ?? []).includes(
    Permission.SETTINGS_MANAGE
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Forbidden: insufficient permissions to manage settings' },
      { status: 403 },
    );
  }

  if (!identity.orgId) {
    return NextResponse.json(
      { error: 'No organization found for user' },
      { status: 400 },
    );
  }

  let body: { role?: string; allowed_actions?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { role, allowed_actions } = body;

  if (!role || !VALID_ROLES.has(role as Role)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${[...VALID_ROLES].join(', ')}` },
      { status: 400 },
    );
  }

  if (!Array.isArray(allowed_actions)) {
    return NextResponse.json(
      { error: 'allowed_actions must be an array' },
      { status: 400 },
    );
  }

  const invalidActions = allowed_actions.filter(
    (a) => !VALID_PERMISSIONS.has(a as Permission),
  );
  if (invalidActions.length > 0) {
    return NextResponse.json(
      { error: `Invalid permissions: ${invalidActions.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    await ensureTable();
    const db = getPool();

    await db.query(
      `INSERT INTO permission_overrides (org_id, role, allowed_actions, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (org_id, role) DO UPDATE
       SET allowed_actions = $3, updated_at = NOW()`,
      [identity.orgId, role, allowed_actions],
    );

    return NextResponse.json({ success: true, role, allowed_actions });
  } catch {
    return NextResponse.json(
      { error: 'Failed to save permission overrides' },
      { status: 500 },
    );
  }
}
