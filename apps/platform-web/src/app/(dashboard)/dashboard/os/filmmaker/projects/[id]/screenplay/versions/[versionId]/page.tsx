/**
 * Filmmaker OS — Screenplay version detail (read-only).
 *
 * Loads a historical version, its scenes, and renders a read-only view
 * with a "Restore as new head" affordance.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getProject,
  getScreenplayByProject,
  getScreenplayVersion,
  listScreenplayScenes,
} from '@/lib/agentic-os/filmmaker/repo';
import { ScreenplayVersionView } from '@/components/agentic-os/filmmaker/screenplay/ScreenplayVersionView';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string; versionId: string }>;
}

export default async function FilmmakerScreenplayVersionPage({ params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { id, versionId } = await params;
  const project = await getProject(id, user.userId);
  if (!project) notFound();

  const screenplay = await getScreenplayByProject(id, user.userId);
  if (!screenplay) notFound();

  const version = await getScreenplayVersion(versionId, user.userId);
  if (!version || version.screenplayId !== screenplay.id) notFound();

  const scenes = await listScreenplayScenes(versionId, user.userId);

  return (
    <div className="max-w-7xl">
      <Link
        href={`/dashboard/os/filmmaker/projects/${id}/screenplay`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to screenplay
      </Link>

      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-text-secondary">
          {screenplay.title} · v{version.versionNumber}
          {version.isHead ? ' · head' : ''}
        </p>
        <h1 className="text-2xl font-semibold text-white">
          {version.label || `Version ${version.versionNumber}`}
        </h1>
        <p className="text-xs text-text-secondary mt-1">
          Saved {new Date(version.createdAt).toLocaleString()} ·{' '}
          {version.wordCount.toLocaleString()} words · ~
          {version.pageCountEstimate.toFixed(1)} pages
        </p>
      </div>

      <ScreenplayVersionView
        projectId={id}
        screenplayId={screenplay.id}
        version={version}
        scenes={scenes}
      />
    </div>
  );
}
