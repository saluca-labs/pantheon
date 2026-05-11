/**
 * Filmmaker OS — Character list (project-scoped).
 *
 * Card grid of all characters in a project with search + role filter
 * and an "Add character" drawer.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { getProject, listCharacters } from '@/lib/agentic-os/filmmaker/repo';
import { CharacterListManager } from '@/components/agentic-os/filmmaker/characters/CharacterListManager';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FilmmakerCharacterListPage({ params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) notFound();

  const characters = await listCharacters({
    projectId: id,
    tenantId: user.tenantId,
    userId: user.userId,
  });

  return (
    <div className="max-w-6xl">
      <Link
        href={`/dashboard/os/filmmaker/projects/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to project
      </Link>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Characters</p>
        <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
        <p className="text-sm text-[#94a3b8] mt-1">
          Character sheets — identity, psychology, voice, and relationships.
        </p>
      </div>

      <CharacterListManager projectId={id} initialCharacters={characters} />
    </div>
  );
}
