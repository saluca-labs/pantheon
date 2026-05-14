/**
 * Filmmaker OS — Screenplay editor (head version).
 *
 * Server component: fetches (or auto-creates) the project's screenplay,
 * loads the head version + scenes + version history, hands them off to
 * the client workspace.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getProject,
  getOrCreateScreenplayForProject,
  getScreenplayVersion,
  listScreenplayScenes,
  listScreenplayVersions,
} from '@/lib/agentic-os/filmmaker/repo';
import { ScreenplayWorkspace } from '@/components/agentic-os/filmmaker/screenplay/ScreenplayWorkspace';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FilmmakerScreenplayPage({ params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) notFound();

  const screenplay = await getOrCreateScreenplayForProject(id, user.userId);
  const headVersion = screenplay.headVersionId
    ? await getScreenplayVersion(screenplay.headVersionId, user.userId)
    : null;
  const scenes = headVersion
    ? await listScreenplayScenes(headVersion.id, user.userId)
    : [];
  const versions = await listScreenplayVersions(screenplay.id, user.userId);

  return (
    <div className="max-w-7xl">
      <Link
        href={`/dashboard/os/filmmaker/projects/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to project
      </Link>

      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-text-secondary">Screenplay</p>
        <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
      </div>

      <ScreenplayWorkspace
        projectId={id}
        screenplay={screenplay}
        headVersion={headVersion}
        scenes={scenes}
        versions={versions}
      />
    </div>
  );
}
