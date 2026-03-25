import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { extractRoleFromSession, checkPermission } from '@/lib/rbac/check';
import { Permission } from '@/lib/rbac/permissions';
import { buildIdentityHeaders } from './headers';

const TIRESIAS_API_URL = process.env.TIRESIAS_API_URL ?? 'http://localhost:8900';
const TIRESIAS_API_KEY = process.env.TIRESIAS_API_KEY ?? '';

export interface ProxyOptions {
  requiredPermission?: Permission;
  method?: string;
}

/**
 * Filter response data by team_id.
 *
 * D-04 stopgap: BFF-level post-hoc filtering until the backend schema
 * gains team_id columns in Phase 4. Items without a team_id field pass
 * through unfiltered (backward compat).
 */
export function filterByTeam<T extends Record<string, unknown>>(
  data: T | T[],
  teamId: string,
): T | T[] {
  if (!teamId) return data;

  if (Array.isArray(data)) {
    return data.filter(
      (item) => !item.team_id || item.team_id === teamId,
    );
  }

  // Object with potential array fields (e.g., { providers: [...], sessions: [...] })
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      filtered[key] = (value as Record<string, unknown>[]).filter(
        (item) =>
          typeof item !== 'object' ||
          item === null ||
          !('team_id' in item) ||
          item.team_id === teamId,
      );
    } else {
      filtered[key] = value;
    }
  }
  return filtered as T;
}

/**
 * BFF proxy helper that bridges WorkOS sessions to Tiresias backend
 * API key + identity headers.
 *
 * Flow:
 * 1. Authenticate via WorkOS session
 * 2. Extract role from JWT
 * 3. Check permission (if required)
 * 4. Forward request to backend with API key + identity headers
 * 5. Apply team filtering (D-04 stopgap)
 * 6. Return response
 */
export async function proxyToBackend(
  request: NextRequest,
  backendPath: string,
  options: ProxyOptions = {},
): Promise<NextResponse> {
  // 1. Authenticate
  const session = await withAuth();
  if (!session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Extract identity from JWT
  const identity = extractRoleFromSession(session);

  // 3. Permission check (if required)
  if (options.requiredPermission) {
    const result = checkPermission(session, options.requiredPermission);
    if (!result.allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // 4. Build backend URL and forward query params
  const url = new URL(backendPath, TIRESIAS_API_URL);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  // 5. Fetch from backend
  let backendResponse: Response;
  try {
    backendResponse = await fetch(url.toString(), {
      method: options.method ?? request.method,
      headers: {
        'X-Tiresias-Api-Key': TIRESIAS_API_KEY,
        ...buildIdentityHeaders({
          userId: identity.userId,
          role: identity.role,
          teamId: identity.teamId,
        }),
      },
      body: request.method !== 'GET' ? await request.text() : undefined,
    });
  } catch {
    // Network error (ECONNREFUSED, DNS failure, etc.)
    return NextResponse.json(
      {
        error: 'Backend unreachable',
        message:
          'Backend unreachable, standing by to provide response. Retrying...',
      },
      { status: 502 },
    );
  }

  // 6. Handle non-ok responses
  if (!backendResponse.ok && backendResponse.status >= 500) {
    return NextResponse.json(
      {
        error: 'Backend unreachable',
        message:
          'Backend unreachable, standing by to provide response. Retrying...',
      },
      { status: 502 },
    );
  }

  // 7. Parse response and apply team filtering (D-04)
  let data: unknown;
  try {
    data = await backendResponse.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid backend response' },
      { status: 502 },
    );
  }

  // 8. Apply team filtering if team_id is present
  if (identity.teamId && data !== null && typeof data === 'object') {
    data = filterByTeam(
      data as Record<string, unknown>,
      identity.teamId,
    );
  }

  return NextResponse.json(data, { status: backendResponse.status });
}
