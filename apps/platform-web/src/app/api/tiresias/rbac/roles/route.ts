import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { extractRoleFromSession, checkPermission } from '@/lib/rbac/check';
import { Permission, Role } from '@/lib/rbac/permissions';

const WORKOS_API_KEY = process.env.WORKOS_API_KEY ?? '';
const WORKOS_API_BASE = 'https://api.workos.com';

/**
 * GET /api/tiresias/rbac/roles
 *
 * Lists organization members with their roles via WorkOS Admin API.
 * Any authenticated user can list members (read access).
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
    const url = new URL(
      '/user_management/organization_memberships',
      WORKOS_API_BASE,
    );
    url.searchParams.set('organization_id', identity.orgId);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${WORKOS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch members from WorkOS' },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Failed to connect to WorkOS API' },
      { status: 502 },
    );
  }
}

/**
 * PATCH /api/tiresias/rbac/roles
 *
 * Updates a member's role via WorkOS Admin API.
 * Requires MEMBERS_MANAGE permission (admin only by default).
 * Per RBAC-01: admins can assign roles to org members.
 * Per D-18: BFF is the policy enforcement point for writes.
 */
export async function PATCH(request: NextRequest) {
  const session = await withAuth();
  if (!session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Permission check: only users with MEMBERS_MANAGE can change roles
  const permResult = checkPermission(session, Permission.MEMBERS_MANAGE);
  if (!permResult.allowed) {
    return NextResponse.json(
      { error: 'Forbidden: insufficient permissions to manage members' },
      { status: 403 },
    );
  }

  // Parse and validate request body
  let body: { membershipId?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const { membershipId, role } = body;
  if (!membershipId || typeof membershipId !== 'string') {
    return NextResponse.json(
      { error: 'membershipId is required' },
      { status: 400 },
    );
  }

  // Validate role is one of the valid Role enum values
  const validRoles = new Set(Object.values(Role));
  if (!role || !validRoles.has(role as Role)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${[...validRoles].join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const url = new URL(
      `/user_management/organization_memberships/${membershipId}`,
      WORKOS_API_BASE,
    );

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${WORKOS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role_slug: role }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Failed to update role in WorkOS', details: errorData },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Failed to connect to WorkOS API' },
      { status: 502 },
    );
  }
}
