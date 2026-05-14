/**
 * Shared SavedViews — collection endpoint.
 *
 * Server-side persistence for the cross-OS `SavedViews` UI primitive.
 * Backs `agos_shared_saved_views` (migration 0070) via the shared
 * `saved-views-repo`.
 *
 * GET    /api/tiresias/agentic-os/shared/saved-views?entityKind=<key>
 *   List the caller's saved views for one surface. `entityKind` is
 *   required — it is the opaque per-surface scope key the list page
 *   picks (e.g. `research:hypotheses`, `blockers`). Returns
 *   `{ views: SavedViewRow[] }`, oldest-first.
 *
 * POST   /api/tiresias/agentic-os/shared/saved-views
 *   Create a saved view for the current user. Body:
 *     { entityKind, name, query, id? }
 *   `id` is optional — the client hook generates it so its `saveView`
 *   can stay synchronous; the route passes it straight through. Returns
 *   `{ view: SavedViewRow }` with 201.
 *
 * Auth: `@platform/auth` via the shared OS session helper. 401 when
 * unauthenticated. Ownership is enforced in the repo (every query
 * filters by `user_id`).
 *
 * @license MIT — Tiresias platform / Wave E shared primitives (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentOsUser } from '@/lib/agentic-os/_shared/session';
import { recordAudit } from '@/lib/agentic-os/health/repo';
import {
  listSavedViews,
  createSavedView,
} from '@/lib/agentic-os/_shared/saved-views-repo';

const CreateBody = z
  .object({
    /** Opaque per-surface scope key. Free-form but bounded. */
    entityKind: z.string().min(1).max(200),
    /** Human label rendered in the pill. */
    name: z.string().min(1).max(300),
    /**
     * Opaque serialized view state — the UI owns this shape, so it is
     * accepted as any JSON value (object is the common case, but the
     * primitive is generic over `TQuery`).
     */
    query: z.unknown(),
    /** Optional client-generated id (keeps the hook's saveView sync). */
    id: z.string().uuid().optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const user = await getCurrentOsUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entityKind = new URL(request.url).searchParams.get('entityKind');
  if (!entityKind || !entityKind.trim()) {
    return NextResponse.json(
      { error: 'entityKind query param is required' },
      { status: 400 },
    );
  }

  const views = await listSavedViews(user.userId, entityKind);
  return NextResponse.json({ views });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentOsUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { entityKind, name, query, id } = parsed.data;

  const view = await createSavedView(user.userId, {
    entityKind,
    name,
    query,
    id,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'shared.saved-view.created',
    payload: { id: view.id, entityKind: view.entityKind },
  }).catch((err) => {
    // Audit is best-effort — a failed audit row never blocks the write.
    // eslint-disable-next-line no-console
    console.error('[saved-views] audit failed', err);
  });

  return NextResponse.json({ view }, { status: 201 });
}
