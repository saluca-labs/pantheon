import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  getTarget,
  updateTarget,
  deleteTarget,
} from '@/lib/agentic-os/creator/publishing-targets-repo';
import {
  PUBLISHING_PLATFORMS,
  PUBLISHING_FORMATS,
  PUBLISHING_TARGET_STATUSES,
  isValidIsbn13,
} from '@/lib/agentic-os/creator/publishing-targets';
import { isValidBisacFormat } from '@/lib/agentic-os/creator/bisac-codes';

const UpdateBody = z.object({
  platform: z.enum(PUBLISHING_PLATFORMS).optional(),
  format: z.enum(PUBLISHING_FORMATS).optional(),
  trimSize: z.string().max(20).nullable().optional(),
  isbn: z
    .string()
    .max(20)
    .nullable()
    .optional()
    .refine((v) => v == null || v === '' || isValidIsbn13(v), {
      message: 'ISBN must be a valid ISBN-13 (978/979 prefix + checksum)',
    }),
  bisacCodes: z
    .array(z.string())
    .max(20)
    .optional()
    .refine((arr) => arr == null || arr.every(isValidBisacFormat), {
      message: 'Each BISAC code must be 3 letters + 6 digits',
    }),
  priceUsd: z.number().nonnegative().max(9999.99).nullable().optional(),
  status: z.enum(PUBLISHING_TARGET_STATUSES).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string; targetId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookId, targetId } = await params;
  const target = await getTarget(targetId, bookId, user.userId);
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(target);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string; targetId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookId, targetId } = await params;
  const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const outcome = await updateTarget(targetId, bookId, user.userId, parsed.data);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(outcome.target);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string; targetId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookId, targetId } = await params;
  const deleted = await deleteTarget(targetId, bookId, user.userId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
