/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/relationships/[relationshipId]
 *
 * PATCH  — partial update of kind / direction / description / tension.
 * DELETE — remove the relationship.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getCharacterRelationship,
  updateCharacterRelationship,
  deleteCharacterRelationship,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import {
  RELATIONSHIP_KIND_VALUES,
  RELATIONSHIP_DIRECTION_VALUES,
  type CharacterRelationshipUpsert,
} from '@/lib/agentic-os/filmmaker/characters';

const PatchBody = z
  .object({
    kind: z.enum(RELATIONSHIP_KIND_VALUES as unknown as [string, ...string[]]).optional(),
    direction: z
      .enum(RELATIONSHIP_DIRECTION_VALUES as unknown as [string, ...string[]])
      .optional(),
    description: z.string().max(2000).nullable().optional(),
    tension: z.number().int().min(0).max(10).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Provide at least one field to update.',
  });

interface Props {
  params: Promise<{ relationshipId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { relationshipId } = await params;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const relationship = await updateCharacterRelationship({
    id: relationshipId,
    tenantId: user.tenantId,
    userId: user.userId,
    patch: parsed.data as Partial<Omit<CharacterRelationshipUpsert, 'fromId' | 'toId'>>,
  });
  if (!relationship) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.relationship.update',
    payload: {
      relationshipId,
      projectId: relationship.projectId,
      fields: Object.keys(parsed.data),
    },
    projectId: relationship.projectId,
  });

  return NextResponse.json({ relationship });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { relationshipId } = await params;
  const relationship = await getCharacterRelationship(relationshipId, user.userId);
  if (!relationship) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deleteCharacterRelationship(relationshipId, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.relationship.delete',
    payload: { relationshipId, projectId: relationship.projectId },
    projectId: relationship.projectId,
  });

  return NextResponse.json({ ok: true });
}
