import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  listTargets,
  createTarget,
} from '@/lib/agentic-os/creator/publishing-targets-repo';
import {
  PUBLISHING_PLATFORMS,
  PUBLISHING_FORMATS,
  PUBLISHING_TARGET_STATUSES,
  isValidIsbn13,
} from '@/lib/agentic-os/creator/publishing-targets';
import { isValidBisacFormat } from '@/lib/agentic-os/creator/bisac-codes';

const CreateBody = z.object({
  platform: z.enum(PUBLISHING_PLATFORMS),
  format: z.enum(PUBLISHING_FORMATS),
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
      message: 'Each BISAC code must be 3 letters + 6 digits (e.g. COM051000)',
    }),
  priceUsd: z.number().nonnegative().max(9999.99).nullable().optional(),
  status: z.enum(PUBLISHING_TARGET_STATUSES).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookId } = await params;
  const targets = await listTargets(bookId, user.userId);
  return NextResponse.json({ targets });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookId } = await params;
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const target = await createTarget(bookId, user.userId, parsed.data);
  if (!target) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  return NextResponse.json(target, { status: 201 });
}
