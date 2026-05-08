/**
 * Agentic OS — /api/tiresias/agentic-os/audit
 *
 * GET — paginated read of the authenticated user's `agos_audit` rows.
 *
 * Query params:
 *   slug    — filter to a single OS slug (one of AGENTIC_OS_MODULES)
 *   action  — exact-match action filter (e.g. "maker.build.created")
 *   from    — inclusive lower bound on created_at (ISO-8601)
 *   to      — exclusive upper bound on created_at (ISO-8601)
 *   limit   — page size, 1..200, default 50
 *   cursor  — opaque cursor returned by previous page's `nextCursor`
 *
 * Response:
 *   { entries: AuditEntry[], nextCursor: string | null }
 *
 * Authorization: callers only ever see rows where actor_id = their userId.
 *
 * @license MIT — Tiresias platform (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAuditUser } from '@/lib/agentic-os/audit/session';
import {
  listAudit,
  encodeCursor,
  decodeCursor,
  isValidSlug,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  type AuditEntry,
} from '@/lib/agentic-os/audit/repo';

export interface AuditListResponse {
  entries: AuditEntry[];
  nextCursor: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentAuditUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const sp = url.searchParams;

  const slug = sp.get('slug');
  if (slug && !isValidSlug(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const action = sp.get('action');
  if (action !== null && (action.length === 0 || action.length > 200)) {
    return NextResponse.json({ error: 'Invalid action filter' }, { status: 400 });
  }

  const fromTs = sp.get('from');
  if (fromTs && Number.isNaN(Date.parse(fromTs))) {
    return NextResponse.json({ error: 'Invalid from timestamp' }, { status: 400 });
  }
  const toTs = sp.get('to');
  if (toTs && Number.isNaN(Date.parse(toTs))) {
    return NextResponse.json({ error: 'Invalid to timestamp' }, { status: 400 });
  }

  let limit = DEFAULT_LIMIT;
  const limitRaw = sp.get('limit');
  if (limitRaw !== null) {
    const parsed = parseInt(limitRaw, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return NextResponse.json(
        { error: `Invalid limit (1..${MAX_LIMIT})` },
        { status: 400 },
      );
    }
    limit = parsed;
  }

  const cursorRaw = sp.get('cursor');
  let cursor = null;
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }
  }

  const result = await listAudit({
    actorId: user.userId,
    slug,
    action,
    fromTs,
    toTs,
    limit,
    cursor,
  });

  const body: AuditListResponse = {
    entries: result.entries,
    nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
  };

  return NextResponse.json(body);
}
