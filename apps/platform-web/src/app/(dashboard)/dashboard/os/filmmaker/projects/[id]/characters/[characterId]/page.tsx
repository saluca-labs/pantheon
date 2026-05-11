/**
 * Filmmaker OS — Character detail.
 *
 * Per-character page with Identity / Psychology / Voice tabs (rendered
 * read-only and via CharacterForm in edit mode) plus a Relationships
 * panel scoped to this character.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getProject,
  getCharacter,
  listCharacters,
  listCharacterRelationships,
} from '@/lib/agentic-os/filmmaker/repo';
import { CharacterDetailWorkspace } from '@/components/agentic-os/filmmaker/characters/CharacterDetailWorkspace';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string; characterId: string }>;
}

export default async function FilmmakerCharacterDetailPage({ params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { id, characterId } = await params;
  const project = await getProject(id, user.userId);
  if (!project) notFound();

  const character = await getCharacter(characterId, user.userId);
  if (!character || character.projectId !== id) notFound();

  const allCharacters = await listCharacters({
    projectId: id,
    tenantId: user.tenantId,
    userId: user.userId,
  });

  const relationships = await listCharacterRelationships({
    projectId: id,
    tenantId: user.tenantId,
    userId: user.userId,
    characterId,
  });

  return (
    <div className="max-w-6xl">
      <Link
        href={`/dashboard/os/filmmaker/projects/${id}/characters`}
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to characters
      </Link>

      <CharacterDetailWorkspace
        projectId={id}
        character={character}
        allCharacters={allCharacters}
        relationships={relationships}
      />
    </div>
  );
}
