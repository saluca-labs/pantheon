/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/characters/[characterId]
 *
 * GET    — fetch one character.
 * PATCH  — partial update.
 * DELETE — remove (cascades relationships via FK).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getCharacter,
  updateCharacter,
  deleteCharacter,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import { CHARACTER_ROLE_VALUES } from '@/lib/agentic-os/filmmaker/characters';

const PatchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    role: z.enum(CHARACTER_ROLE_VALUES as unknown as [string, ...string[]]).optional(),
    archetype: z.string().max(200).nullable().optional(),
    logline: z.string().max(500).nullable().optional(),
    age: z.string().max(80).nullable().optional(),
    pronouns: z.string().max(80).nullable().optional(),
    gender: z.string().max(80).nullable().optional(),
    occupation: z.string().max(200).nullable().optional(),
    backstory: z.string().nullable().optional(),
    goals: z.string().nullable().optional(),
    needs: z.string().nullable().optional(),
    fears: z.string().nullable().optional(),
    wounds: z.string().nullable().optional(),
    arc: z.string().nullable().optional(),
    voiceNotes: z.string().nullable().optional(),
    physicalDescription: z.string().nullable().optional(),
    portraitUrl: z.string().url().max(2000).nullable().optional(),
    tags: z.array(z.string().min(1).max(80)).max(40).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Provide at least one field to update.',
  });

interface Props {
  params: Promise<{ characterId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { characterId } = await params;
  const character = await getCharacter(characterId, user.userId);
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ character });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { characterId } = await params;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const character = await updateCharacter({
    id: characterId,
    tenantId: user.tenantId,
    userId: user.userId,
    patch: parsed.data as any,
  });
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.character.update',
    payload: {
      characterId,
      projectId: character.projectId,
      fields: Object.keys(parsed.data),
    },
    projectId: character.projectId,
  });

  return NextResponse.json({ character });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { characterId } = await params;
  const character = await getCharacter(characterId, user.userId);
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deleteCharacter(characterId, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.character.delete',
    payload: { characterId, projectId: character.projectId, name: character.name },
    projectId: character.projectId,
  });

  return NextResponse.json({ ok: true });
}
