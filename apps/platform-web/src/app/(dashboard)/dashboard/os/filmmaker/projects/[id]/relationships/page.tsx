/**
 * Filmmaker OS — Project-level relationships view.
 *
 * Table view of all relationships in the project with filter + edit +
 * delete. The d3-force visualization is deferred to a polish pass.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getProject,
  listCharacters,
  listCharacterRelationships,
} from '@/lib/agentic-os/filmmaker/repo';
import { RelationshipList } from '@/components/agentic-os/filmmaker/characters/RelationshipList';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FilmmakerRelationshipsPage({ params }: Props) {
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

  const relationships = await listCharacterRelationships({
    projectId: id,
    tenantId: user.tenantId,
    userId: user.userId,
  });

  return (
    <div className="max-w-5xl">
      <Link
        href={`/dashboard/os/filmmaker/projects/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to project
      </Link>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Relationships</p>
        <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
        <p className="text-sm text-[#94a3b8] mt-1">
          The graph of who knows whom — text-only for now. Visual graph is a future polish pass.
        </p>
      </div>

      {characters.length < 2 ? (
        <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27]/40 p-10 text-center">
          <p className="text-sm text-white">
            Add at least two characters to begin mapping relationships.
          </p>
          <Link
            href={`/dashboard/os/filmmaker/projects/${id}/characters`}
            className="mt-3 inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md border border-[#2a2d3e] bg-[#4361EE]/80 hover:bg-[#4361EE] text-white transition"
          >
            Go to characters
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
          <RelationshipList
            projectId={id}
            characters={characters}
            initialRelationships={relationships}
          />
        </div>
      )}
    </div>
  );
}
