import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  deleteCbtLog,
  getActiveConsent,
  getCbtLog,
  recordAudit,
  recordRiskFlag,
  updateCbtLog,
} from '@/lib/agentic-os/health/repo';
import {
  CbtBehavioralActivationData,
  CbtGratitudeData,
  CbtGroundingData,
  CbtLogUpdateBody,
  CbtSleepHygieneData,
  CbtThoughtRecordData,
  CbtValuesData,
  CbtWorryTimeData,
  type CbtKind,
} from '@/lib/agentic-os/health/schemas';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';

interface RouteCtx {
  params: Promise<{ id: string }>;
}

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

/** Re-validate `data` against the per-kind schema selected by `kind`. */
function validateCbtData(kind: CbtKind, data: unknown):
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; detail: unknown } {
  const schemas = {
    'thought-record': CbtThoughtRecordData,
    'behavioral-activation': CbtBehavioralActivationData,
    'worry-time': CbtWorryTimeData,
    'grounding-54321': CbtGroundingData,
    gratitude: CbtGratitudeData,
    'values-clarification': CbtValuesData,
    'sleep-hygiene': CbtSleepHygieneData,
  } as const;
  const schema = schemas[kind];
  const parsed = schema.safeParse(data);
  if (!parsed.success) return { ok: false, detail: parsed.error.flatten() };
  return { ok: true, data: parsed.data as Record<string, unknown> };
}

export async function GET(_request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const log = await getCbtLog(id, ok.user.userId);
  if (!log) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ log });
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = CbtLogUpdateBody.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  // If the caller is updating the structured payload, they MUST supply
  // `kind` so we know which per-kind schema to re-validate against.
  let validatedData: Record<string, unknown> | undefined;
  if (parsed.data.data !== undefined) {
    if (!parsed.data.kind) {
      return NextResponse.json(
        { error: 'Updating data requires kind' },
        { status: 400 },
      );
    }
    const r = validateCbtData(parsed.data.kind, parsed.data.data);
    if (!r.ok) {
      return NextResponse.json(
        { error: 'Invalid data shape', detail: r.detail },
        { status: 400 },
      );
    }
    validatedData = r.data;
  }

  // Free text on update: prose-likely fields inside the validated data
  // payload, plus the notes field. Mirror POST's extractor.
  const extractText = (
    b: typeof parsed.data,
  ): Array<string | null | undefined> => {
    const out: (string | null | undefined)[] = [b.notes ?? null];
    if (validatedData && parsed.data.kind) {
      const data = validatedData;
      const push = (k: string) => {
        const v = data[k];
        if (typeof v === 'string') out.push(v);
      };
      switch (parsed.data.kind) {
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
          break;
      }
    }
    return out;
  };

  const updated = await withCrisisGuard(
    parsed.data,
    {
      osSlug: 'health',
      source: `cbt-${parsed.data.kind ?? 'update'}`,
      extractText,
      persistFlag: (flag) =>
        recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(
          () => undefined,
        ),
    },
    () =>
      updateCbtLog(id, ok.user.userId, {
        data: validatedData,
        moodBefore: parsed.data.moodBefore ?? null,
        moodAfter: parsed.data.moodAfter ?? null,
        notes: parsed.data.notes ?? null,
        completed: parsed.data.completed,
      }),
  );
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.cbt.updated',
    payload: { id, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ log: updated });
}

export async function DELETE(_request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const deleted = await deleteCbtLog(id, ok.user.userId);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.cbt.deleted',
    payload: { id },
  });
  return NextResponse.json({ ok: true });
}
