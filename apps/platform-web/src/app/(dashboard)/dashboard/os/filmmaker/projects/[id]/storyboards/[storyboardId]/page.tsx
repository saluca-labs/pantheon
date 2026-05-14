/**
 * Filmmaker OS — Storyboard editor page.
 *
 * Header (name, status, optional scene, description) + panel grid.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft, Layers } from 'lucide-react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getProject,
  getStoryboard,
  getScreenplayByProject,
  listScreenplayScenes,
} from '@/lib/agentic-os/filmmaker/repo';
import { StoryboardWorkspace } from '@/components/agentic-os/filmmaker/storyboard/StoryboardWorkspace';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string; storyboardId: string }>;
}

export default async function FilmmakerStoryboardEditorPage({ params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { id, storyboardId } = await params;
  const project = await getProject(id, user.userId);
  if (!project) notFound();

  const storyboard = await getStoryboard(storyboardId, user.userId);
  if (!storyboard || storyboard.projectId !== id) notFound();

  const screenplay = await getScreenplayByProject(id, user.userId);
  const scenes = screenplay?.headVersionId
    ? await listScreenplayScenes(screenplay.headVersionId, user.userId)
    : [];

  return (
    <div className="max-w-6xl">
      <Link
        href={`/dashboard/os/filmmaker/projects/${id}/storyboards`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to storyboards
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Layers className="w-6 h-6 text-accent" />
          <p className="text-xs uppercase tracking-wide text-text-secondary">Storyboard</p>
        </div>
        <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
      </div>

      <StoryboardWorkspace
        projectId={id}
        storyboard={storyboard}
        scenes={scenes}
      />
    </div>
  );
}
