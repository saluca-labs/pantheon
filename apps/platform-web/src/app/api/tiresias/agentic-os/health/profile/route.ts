import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { getProfile, upsertProfile, recordAudit } from '@/lib/agentic-os/health/repo';

const ProfileBody = z.object({
  sex: z.string().min(1).max(32).nullable().optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  heightCm: z.number().min(30).max(300).nullable().optional(),
  weightKg: z.number().min(10).max(500).nullable().optional(),
  activityLevel: z
    .enum(['sedentary', 'light', 'moderate', 'active', 'very_active'])
    .nullable()
    .optional(),
  goals: z.array(z.string().min(1).max(120)).max(20).optional(),
  conditions: z.array(z.string().min(1).max(120)).max(40).optional(),
  medications: z.array(z.string().min(1).max(160)).max(40).optional(),
  allergies: z.array(z.string().min(1).max(120)).max(40).optional(),
});

export async function GET() {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const profile = await getProfile(user.userId);
  return NextResponse.json({ profile });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = ProfileBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updated = await upsertProfile(user.userId, parsed.data);
  await recordAudit({
    actorId: user.userId,
    action: 'health.profile.upserted',
    payload: { fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ profile: updated });
}
