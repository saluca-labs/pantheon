/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]/relationships
 *
 * GET  — list relationships for a project (optional `characterId` filter).
 * POST — create a relationship between two characters in this project.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  listCharacterRelationships,
  createCharacterRelationship,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import {
  RELATIONSHIP_KIND_VALUES,
  RELATIONSHIP_DIRECTION_VALUES,
} from '@/lib/agentic-os/filmmaker/characters';

const CreateBody = z.object({
  fromId: z.string().uuid(),
  toId: z.string().uuid(),
  kind: z.enum(RELATIONSHIP_KIND_VALUES as unknown as [string, ...string[]]).optional(),
  direction: z
    .enum(RELATIONSHIP_DIRECTION_VALUES as unknown as [string, ...string[]])
    .optional(),
  description: z.string().max(2000).nullable().optional(),
  tension: z.number().int().min(0).max(10).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const characterId = new URL(request.url).searchParams.get('characterId') ?? undefined;

  const relationships = await listCharacterRelationships({
    projectId: id,
    tenantId: user.tenantId,
    userId: user.userId,
    characterId,
  });
  return NextResponse.json({ relationships });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const relationship = await createCharacterRelationship({
      tenantId: user.tenantId,
      userId: user.userId,
      data: parsed.data as any,
    });

    if (relationship.projectId !== id) {
      return NextResponse.json(
        { error: 'Characters do not belong to this project' },
        { status: 400 },
      );
    }

    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.relationship.create',
      payload: {
        projectId: id,
        relationshipId: relationship.id,
        fromId: relationship.fromId,
        toId: relationship.toId,
        kind: relationship.kind,
      },
      projectId: id,
    });

    return NextResponse.json({ relationship }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
