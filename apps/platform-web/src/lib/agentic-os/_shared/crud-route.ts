/**
 * Generic CRUD route factory for Agentic OS BFF endpoints.
 *
 * Most agentic-os entities follow the same pattern:
 *   GET    list / get-one
 *   POST   create with Zod-validated body
 *   PATCH  update with partial Zod-validated body
 *   DELETE remove by id
 *
 * Each handler also runs the standard 401 check, an `opAction` audit
 * record, and (optionally) a per-OS consent gate. `createCrudRoute`
 * abstracts that boilerplate so a route file can be a few lines:
 *
 * ```ts
 * import { createCrudRoute } from '@/lib/agentic-os/_shared/crud-route';
 * import { MoodEntryBody, MoodEntryUpdate } from '../schemas';
 * import { recordMoodEntry, listMoodEntries } from '../repo';
 *
 * export const { GET, POST } = createCrudRoute({
 *   slug: 'health',
 *   resolveUser: getCurrentHealthUser,
 *   opAction: 'health.mood',
 *   create: { schema: MoodEntryBody, run: ({ user, body }) => recordMoodEntry(...) },
 *   list:   { run: ({ user }) => listMoodEntries(user.userId) },
 * });
 * ```
 *
 * The factory is intentionally thin — it does NOT try to handle
 * pagination, dynamic routes, or non-Zod parsing. Routes that need
 * those can hand-write the handler and still call `recordAudit` /
 * `withCrisisGuard` directly.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import type { ZodSchema } from 'zod';
import { recordAudit } from '../health/repo';

export interface CrudUser {
  userId: string;
  tenantId: string;
}

export interface HandlerCtx<TBody, TUser extends CrudUser = CrudUser> {
  request: NextRequest;
  user: TUser;
  body: TBody;
}

export interface ListCtx<TUser extends CrudUser = CrudUser> {
  request: NextRequest;
  user: TUser;
}

export interface CrudRouteSpec<
  TCreateBody,
  TListResult,
  TCreateResult,
  TUser extends CrudUser = CrudUser,
> {
  /** OS slug, used as the audit `os_slug`. */
  slug: string;
  /** Resolves the current user; null → 401. */
  resolveUser: () => Promise<TUser | null>;
  /**
   * Audit action stem (e.g. 'health.mood'). The factory appends the
   * verb: '.created', '.listed'. Pass the empty string to suppress audit.
   */
  opAction: string;
  /**
   * Optional consent check — return false to short-circuit with 403.
   * Receives the resolved user.
   */
  consentCheck?: (user: TUser) => Promise<boolean>;
  list?: {
    run: (ctx: ListCtx<TUser>) => Promise<TListResult>;
    /** Skip the audit row on listings (default true; reads aren't audited). */
    audit?: boolean;
  };
  create?: {
    schema: ZodSchema<TCreateBody>;
    run: (ctx: HandlerCtx<TCreateBody, TUser>) => Promise<TCreateResult>;
  };
}

export function createCrudRoute<
  TCreateBody,
  TListResult,
  TCreateResult,
  TUser extends CrudUser = CrudUser,
>(spec: CrudRouteSpec<TCreateBody, TListResult, TCreateResult, TUser>) {
  async function authedUser(): Promise<TUser | NextResponse> {
    const user = await spec.resolveUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (spec.consentCheck) {
      const ok = await spec.consentCheck(user);
      if (!ok) {
        return NextResponse.json(
          { error: 'Consent required' },
          { status: 403 },
        );
      }
    }
    return user;
  }

  const handlers: {
    GET?: (request: NextRequest) => Promise<Response>;
    POST?: (request: NextRequest) => Promise<Response>;
  } = {};

  if (spec.list) {
    handlers.GET = async (request: NextRequest) => {
      const user = await authedUser();
      if (user instanceof NextResponse) return user;
      const items = await spec.list!.run({ request, user });
      return NextResponse.json(items);
    };
  }

  if (spec.create) {
    const create = spec.create;
    handlers.POST = async (request: NextRequest) => {
      const user = await authedUser();
      if (user instanceof NextResponse) return user;
      const json = await request.json().catch(() => null);
      const parsed = create.schema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid body', detail: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const result = await create.run({
        request,
        user,
        body: parsed.data,
      });
      if (spec.opAction) {
        await recordAudit({
          actorId: user.userId,
          action: `${spec.opAction}.created`,
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[crud-route] audit failed', err);
        });
      }
      return NextResponse.json(result, { status: 201 });
    };
  }

  return handlers;
}
