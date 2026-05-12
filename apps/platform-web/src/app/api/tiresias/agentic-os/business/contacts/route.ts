/**
 * Business OS — legacy `/contacts` route (DEPRECATED in Phase 1).
 *
 * GET passthrough that joins all three Phase-1 resources (people +
 * organizations + interactions) into the legacy `{people, interactions}`
 * data shape so the existing `ContactsCrm` client keeps loading until
 * the page-level redirect to `/dashboard/os/business` is the only path
 * users take.
 *
 * NO POST.  Mutations on this surface were never authoritative — the
 * client now uses the focused `/people`, `/organizations`, and
 * `/interactions` routes.  Returns 410 Gone on POST to surface the
 * deprecation clearly to integrators.
 *
 * Future removal: this file will be deleted once the redirect page has
 * been live for one release and no external integrations still hit it.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listPeople, listOrganizations, listInteractions } from '@/lib/agentic-os/business/repo';

export async function GET() {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [people, organizations, interactions] = await Promise.all([
    listPeople(user.userId, { archived: false }),
    listOrganizations(user.userId, { archived: false }),
    listInteractions(user.userId, { limit: 50 }),
  ]);
  return NextResponse.json({ people, organizations, interactions });
}

export async function POST() {
  return NextResponse.json(
    {
      error: 'Endpoint removed in Phase 1',
      detail:
        'Use /api/tiresias/agentic-os/business/people, /organizations, or /interactions instead.',
    },
    { status: 410 },
  );
}
