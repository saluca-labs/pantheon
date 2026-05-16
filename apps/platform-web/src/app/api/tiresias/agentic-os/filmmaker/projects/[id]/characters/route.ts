/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]/characters
 *
 * GET  — list characters for a project (supports `q` search + `role` filter).
 * POST — create a character.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  listCharacters,
  createCharacter,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import {
  CHARACTER_ROLE_VALUES,
  type CharacterRole,
  type CharacterUpsert,
} from '@/lib/agentic-os/filmmaker/characters';

const CreateBody = z.object({
  name: z.string().min(1).max(200),
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
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? undefined;
  const roleParam = url.searchParams.get('role');
  const role =
    roleParam && (CHARACTER_ROLE_VALUES as readonly string[]).includes(roleParam)
      ? (roleParam as CharacterRole)
      : undefined;

  const characters = await listCharacters({
    projectId: id,
    tenantId: user.tenantId,
    userId: user.userId,
    q,
    role,
  });
  return NextResponse.json({ characters });
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

  const character = await createCharacter({
    projectId: id,
    tenantId: user.tenantId,
    userId: user.userId,
    data: parsed.data as CharacterUpsert,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.character.create',
    payload: {
      projectId: id,
      characterId: character.id,
      name: character.name,
      role: character.role,
    },
    projectId: id,
  });

  return NextResponse.json({ character }, { status: 201 });
}
