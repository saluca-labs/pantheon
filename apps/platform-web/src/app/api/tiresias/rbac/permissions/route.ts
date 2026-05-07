import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { extractRoleFromSession, checkPermission } from '@/lib/rbac/check';
import {
  Permission,
  Role,
  DEFAULT_ROLE_PERMISSIONS,
} from '@/lib/rbac/permissions';
import { Pool } from 'pg';

/**
 * BFF-local Postgres connection for permission overrides (D-18).
 * Separate from the Tiresias backend database -- this is BFF state.
 */
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.BFF_DATABASE_URL,
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

/**
 * GET /api/tiresias/rbac/permissions
 *
 * Returns the effective permission map for the user's organization.
 * Merges DEFAULT_ROLE_PERMISSIONS with any overrides from BFF-local Postgres.
 * Per RBAC-06: admins can configure granular permissions.
 */
export async function GET() {
  const session = await withAuth();
  if (!session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const identity = extractRoleFromSession(session);
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

    // Start with defaults, overlay any overrides
    const permissions: Record<string, string[]> = {};
    for (const role of Object.values(Role)) {
      permissions[role] = [...DEFAULT_ROLE_PERMISSIONS[role]];
    }

    for (const row of result.rows) {
      if (VALID_ROLES.has(row.role as Role)) {
        // Filter to only valid permission slugs
        permissions[row.role] = row.allowed_actions.filter((a) =>
          VALID_PERMISSIONS.has(a as Permission),
        );
      }
    }

    return NextResponse.json({ permissions });
  } catch {
    // If database is unavailable, fall back to defaults
    const permissions: Record<string, string[]> = {};
    for (const role of Object.values(Role)) {
      permissions[role] = [...DEFAULT_ROLE_PERMISSIONS[role]];
    }
    return NextResponse.json({ permissions });
  }
}

/**
 * POST /api/tiresias/rbac/permissions
 *
 * Saves permission overrides for a specific role in the user's organization.
 * Requires SETTINGS_MANAGE permission (admin only by default).
 * Per RBAC-06: admins can configure which roles can perform which actions.
 * Per D-18: BFF is the policy enforcement point for writes, stored in BFF-local Postgres.
 */
export async function POST(request: NextRequest) {
  const session = await withAuth();
  if (!session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Permission check: only users with SETTINGS_MANAGE can configure permissions
  const permResult = checkPermission(session, Permission.SETTINGS_MANAGE);
  if (!permResult.allowed) {
    return NextResponse.json(
      { error: 'Forbidden: insufficient permissions to manage settings' },
      { status: 403 },
    );
  }

  const identity = extractRoleFromSession(session);
  if (!identity.orgId) {
    return NextResponse.json(
      { error: 'No organization found for user' },
      { status: 400 },
    );
  }

  // Parse and validate request body
  let body: { role?: string; allowed_actions?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const { role, allowed_actions } = body;

  // Validate role
  if (!role || !VALID_ROLES.has(role as Role)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${[...VALID_ROLES].join(', ')}` },
      { status: 400 },
    );
  }

  // Validate allowed_actions
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
