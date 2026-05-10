import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  listCbtLogs,
  recordAudit,
  recordCbtLog,
  recordRiskFlag,
  recordRiskFlags,
  type CbtKindValue,
} from '@/lib/agentic-os/health/repo';
import { evaluateOnCbtLog } from '@/lib/agentic-os/health/risk-flags';
import { CbtLogBody, CBT_KIND_VALUES } from '@/lib/agentic-os/health/schemas';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';

/**
 * GET  — list CBT logs (?kind=, ?from=, ?to=, ?limit=).
 * POST — record a new CBT log; per-kind structured `data` validated by
 *        the discriminated union; free text inside the data payload is
 *        wrapped via `withCrisisGuard`.
 *
 * Mental-scope consent required (matches mood + journal pattern).
 */

async function ensureUserAndConsent() {
  const user = await getCurrentHealthUser();
  if (!user) {
    return {
      err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as const;
  }
  const consent = await getActiveConsent(user.userId, user.tenantId, 'mental');
  if (!consent || !consent.granted) {
    return {
      err: NextResponse.json(
        { error: 'Mental-health consent required' },
        { status: 403 },
      ),
    } as const;
  }
  return { user } as const;
}

function isCbtKind(value: string): value is CbtKindValue {
  return (CBT_KIND_VALUES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const url = new URL(request.url);
  const kindRaw = url.searchParams.get('kind') ?? undefined;
  const kind: CbtKindValue | undefined =
    kindRaw && isCbtKind(kindRaw) ? kindRaw : undefined;
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const limit = url.searchParams.get('limit');
  const logs = await listCbtLogs(ok.user.userId, {
    kind,
    from,
    to,
    limit: limit ? Number(limit) : undefined,
  });
  return NextResponse.json({ logs });
}

export async function POST(request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const json = await request.json().catch(() => null);
  const parsed = CbtLogBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Free-text fields differ per kind. Build a flat array for the guard
  // so it scans every plausibly-prose string regardless of kind.
  const extractText = (b: typeof body): Array<string | null | undefined> => {
    const out: (string | null | undefined)[] = [b.notes ?? null];
    const data = b.data as Record<string, unknown>;
    const push = (k: string) => {
      const v = data[k];
      if (typeof v === 'string') out.push(v);
    };
    switch (b.kind) {
      case 'thought-record':
        push('situation');
        push('automatic_thought');
        push('evidence_for');
        push('evidence_against');
        push('balanced_thought');
        break;
      case 'behavioral-activation':
        push('activity');
        push('reflection');
        break;
      case 'worry-time': {
        push('reflection');
        const worries = data['worries'];
        if (Array.isArray(worries)) {
          for (const w of worries) if (typeof w === 'string') out.push(w);
        }
        break;
      }
      case 'gratitude': {
        const entries = data['entries'];
        if (Array.isArray(entries)) {
          for (const e of entries) if (typeof e === 'string') out.push(e);
        }
        break;
      }
      case 'values-clarification': {
        const values = data['values'];
        if (Array.isArray(values)) {
          for (const v of values) {
            if (v && typeof v === 'object') {
              const action = (v as Record<string, unknown>)['action'];
              if (typeof action === 'string') out.push(action);
            }
          }
        }
        break;
      }
      case 'sleep-hygiene': {
        const notes = data['notes'];
        if (typeof notes === 'string') out.push(notes);
        break;
      }
      case 'grounding-54321':
        // Sense items are short tokens — skip (matches risk-flags policy).
        break;
    }
    return out;
  };

  const created = await withCrisisGuard(
    body,
    {
      osSlug: 'health',
      source: `cbt-${body.kind}`,
      extractText,
      persistFlag: (flag) =>
        recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(
          () => undefined,
        ),
    },
    () =>
      recordCbtLog(ok.user.userId, ok.user.tenantId, {
        kind: body.kind,
        exerciseId: body.exerciseId ?? null,
        data: body.data,
        moodBefore: body.moodBefore ?? null,
        moodAfter: body.moodAfter ?? null,
        notes: body.notes ?? null,
        completed: body.completed ?? true,
      }),
  );

  // Mood-drop pattern check across recent logs (does not block).
  try {
    const recent = await listCbtLogs(ok.user.userId, { limit: 50 });
    const flags = evaluateOnCbtLog(created, recent, {
      source: `cbt-${body.kind}`,
    });
    // The crisis-guard already emits its own crisis-language flag — drop
    // any duplicate emitted by evaluateOnCbtLog so we don't double-record.
    const filtered = flags.filter((f) => f.kind !== 'crisis-language');
    if (filtered.length > 0) {
      await recordRiskFlags(ok.user.userId, ok.user.tenantId, filtered);
    }
  } catch (err) {
    // Non-fatal — never block a save on the watcher.
    // eslint-disable-next-line no-console
    console.error('[cbt] mood-drop watcher failed', err);
  }

  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.cbt.created',
    payload: {
      id: created.id,
      kind: created.kind,
      hasMoodDelta:
        typeof created.moodBefore === 'number' &&
        typeof created.moodAfter === 'number',
    },
  });
  return NextResponse.json({ log: created }, { status: 201 });
}
