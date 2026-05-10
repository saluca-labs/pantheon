import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  listMeditationSessions,
  recordAudit,
  recordMeditationSession,
  recordRiskFlag,
} from '@/lib/agentic-os/health/repo';
import { MeditationSessionBody } from '@/lib/agentic-os/health/schemas';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';
import { createCrudRoute } from '@/lib/agentic-os/_shared/crud-route';

const _crud = createCrudRoute({
  slug: 'health',
  resolveUser: getCurrentHealthUser,
  opAction: 'health.meditation.session',
  consentCheck: async (user) => {
    const consent = await getActiveConsent(
      user.userId,
      user.tenantId,
      'mental',
    );
    return !!consent?.granted;
  },
  list: {
    run: async ({ user, request }) => {
      const url = new URL(request.url);
      const from = url.searchParams.get('from') ?? undefined;
      const to = url.searchParams.get('to') ?? undefined;
      const limit = url.searchParams.get('limit');
      const sessions = await listMeditationSessions(user.userId, {
        from,
        to,
        limit: limit ? Number(limit) : undefined,
      });
      return { sessions };
    },
  },
  create: {
    schema: MeditationSessionBody,
    run: async ({ user, body }) => {
      const created = await withCrisisGuard(
        body,
        {
          osSlug: 'health',
          source: 'meditation-session',
          extractText: (b) => [b.notes],
          persistFlag: (flag) =>
            recordRiskFlag(user.userId, user.tenantId, flag).then(
              () => undefined,
            ),
        },
        () =>
          recordMeditationSession(user.userId, user.tenantId, {
            source: body.source,
            sourceRef: body.sourceRef ?? null,
            durationMin: body.durationMin,
            completedAt: body.completedAt ?? null,
            moodBefore: body.moodBefore ?? null,
            moodAfter: body.moodAfter ?? null,
            notes: body.notes ?? null,
          }),
      );
      await recordAudit({
        actorId: user.userId,
        action: 'health.meditation.session.created',
        payload: {
          id: created.id,
          source: created.source,
          durationMin: created.durationMin,
        },
      });
      return { session: created };
    },
  },
});

export const GET = _crud.GET as (request: NextRequest) => Promise<Response>;
export const POST = _crud.POST as (request: NextRequest) => Promise<Response>;
