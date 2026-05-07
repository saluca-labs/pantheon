import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateSession } from '@platform/auth';
import { getSessionToken } from '@platform/auth/cookies';
import { extractRoleFromLocalSession } from '@/lib/rbac/check';
import { Permission, Role, DEFAULT_ROLE_PERMISSIONS } from '@/lib/rbac/permissions';
import { Pool } from 'pg';

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      max: 5,
    });
  }
  return pool;
}

async function getLocalSession() {
  const cookieStore = await cookies();
  const token = getSessionToken(cookieStore as any);
  if (!token) return null;
  return validateSession(token, getPool());
}

/**
 * GET /api/tiresias/rbac/roles
 *
 * Lists organization members with their roles from local Postgres.
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
    const db = getPool();
    const result = await db.query<{
      id: string;
      user_id: string;
      organization_id: string;
      role: string;
      email: string;
      display_name: string | null;
    }>(
      `SELECT m.id, m.user_id, m.organization_id, m.role,
              u.email, u.display_name
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1
       ORDER BY u.email`,
      [identity.orgId],
    );

    const data = result.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      organization_id: row.organization_id,
      role_slug: row.role,
      user: {
        id: row.user_id,
        email: row.email,
        first_name: row.display_name?.split(' ')[0] ?? null,
        last_name: row.display_name?.split(' ').slice(1).join(' ') ?? null,
      },
    }));

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/tiresias/rbac/roles
 *
 * Updates a member's role. Requires MEMBERS_MANAGE permission.
 */
export async function PATCH(request: NextRequest) {
  const sessionResult = await getLocalSession();
  if (!sessionResult) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const identity = extractRoleFromLocalSession(sessionResult.user);
  const allowed = (DEFAULT_ROLE_PERMISSIONS[identity.role] ?? []).includes(
    Permission.MEMBERS_MANAGE
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Forbidden: insufficient permissions to manage members' },
      { status: 403 },
    );
  }

  let body: { membershipId?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { membershipId, role } = body;
  if (!membershipId || typeof membershipId !== 'string') {
    return NextResponse.json({ error: 'membershipId is required' }, { status: 400 });
  }

  const validRoles = new Set(Object.values(Role));
  if (!role || !validRoles.has(role as Role)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${[...validRoles].join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const db = getPool();
    await db.query(
      `UPDATE memberships SET role = $1 WHERE id = $2`,
      [role, membershipId],
    );
    return NextResponse.json({ success: true, membershipId, role });
  } catch {
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}
