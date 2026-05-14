/**
 * Filmmaker OS — Storyboard library page.
 *
 * Lists storyboards for one project.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft, Layers } from 'lucide-react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getProject,
  listStoryboards,
} from '@/lib/agentic-os/filmmaker/repo';
import { StoryboardList } from '@/components/agentic-os/filmmaker/storyboard/StoryboardList';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FilmmakerStoryboardLibraryPage({ params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) notFound();

  const storyboards = await listStoryboards({ projectId: id, userId: user.userId });

  return (
    <div className="max-w-4xl">
      <Link
        href={`/dashboard/os/filmmaker/projects/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to project
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Layers className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-semibold text-white">Storyboards</h1>
        </div>
        <p className="text-sm text-text-secondary">
          Project: <span className="text-white font-medium">{project.name}</span> ·
          {' '}Visual boards with ordered panels — camera angle, move, shot size, description.
        </p>
      </div>

      <StoryboardList projectId={id} initial={storyboards} />
    </div>
  );
}
