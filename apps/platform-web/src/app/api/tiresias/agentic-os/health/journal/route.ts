import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  listJournalEntries,
  recordAudit,
  recordJournalEntry,
  recordRiskFlag,
} from '@/lib/agentic-os/health/repo';
import { JournalEntryBody } from '@/lib/agentic-os/health/schemas';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';
import { createCrudRoute } from '@/lib/agentic-os/_shared/crud-route';

/**
 * Journal collection endpoint.
 *
 * Built on `createCrudRoute` to demonstrate the shared factory pattern;
 * the per-OS specifics (crisis-guard wrapping the body, mental-scope
 * consent gate) are passed in via the spec hooks.
 *
 * GET  — list recent entries (?from, ?to, ?limit, ?withPrompt=true).
 * POST — create entry; crisis-guard runs over `body` (and `title`).
 */
const _crud = createCrudRoute({
  slug: 'health',
  resolveUser: getCurrentHealthUser,
  opAction: 'health.journal',
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
      const withPrompt = url.searchParams.get('withPrompt') === 'true';
      const entries = await listJournalEntries(user.userId, {
        from,
        to,
        limit: limit ? Number(limit) : undefined,
        withPrompt,
      });
      return { entries };
    },
  },
  create: {
    schema: JournalEntryBody,
    run: async ({ user, body }) => {
      const created = await withCrisisGuard(
        body,
        {
          osSlug: 'health',
          source: 'journal-entry',
          extractText: (b) => [b.title, b.body],
          persistFlag: (flag) =>
            recordRiskFlag(user.userId, user.tenantId, flag).then(() =>
              undefined,
            ),
        },
        () => recordJournalEntry(user.userId, user.tenantId, body),
      );
      await recordAudit({
        actorId: user.userId,
        action: 'health.journal.created',
        payload: {
          id: created.id,
          hasPrompt: !!body.promptId,
          bodyLen: body.body.length,
        },
      });
      return { entry: created };
    },
  },
});

export const GET = _crud.GET as (request: NextRequest) => Promise<Response>;
export const POST = _crud.POST as (request: NextRequest) => Promise<Response>;
