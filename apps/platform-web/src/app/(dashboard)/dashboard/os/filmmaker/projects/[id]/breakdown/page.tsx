/**
 * Filmmaker OS — Breakdown.
 *
 * Per-scene production tagging: 14 categories (cast, props, vehicles,
 * vfx, sfx, music, ...) + scene meta (eighths, complexity, status).
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
  listScreenplayScenes,
  listBreakdownElementsForScreenplay,
  listSceneBreakdownMeta,
  getProjectBreakdownSummary,
} from '@/lib/agentic-os/filmmaker/repo';
import { BreakdownAggregate } from '@/components/agentic-os/filmmaker/breakdown/BreakdownAggregate';
import { BreakdownWorkspace } from '@/components/agentic-os/filmmaker/breakdown/BreakdownWorkspace';
import type { BreakdownElement, SceneBreakdownMeta } from '@/lib/agentic-os/filmmaker/breakdown';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FilmmakerBreakdownPage({ params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) notFound();

  const screenplay = await getOrCreateScreenplayForProject(id, user.userId);
  const scenes = screenplay.headVersionId
    ? await listScreenplayScenes(screenplay.headVersionId, user.userId)
    : [];

  const [elements, metas, summary] = await Promise.all([
    listBreakdownElementsForScreenplay({
      screenplayId: screenplay.id,
      userId: user.userId,
    }),
    listSceneBreakdownMeta({
      screenplayId: screenplay.id,
      userId: user.userId,
    }),
    getProjectBreakdownSummary(id, user.userId),
  ]);

  const elementsByScene: Record<string, BreakdownElement[]> = {};
  for (const el of elements) {
    if (!elementsByScene[el.sceneId]) elementsByScene[el.sceneId] = [];
    elementsByScene[el.sceneId].push(el);
  }
  const metaByScene: Record<string, SceneBreakdownMeta | null> = {};
  for (const m of metas) metaByScene[m.sceneId] = m;

  return (
    <div className="max-w-7xl">
      <Link
        href={`/dashboard/os/filmmaker/projects/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to project
      </Link>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Breakdown</p>
        <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
        <p className="text-sm text-[#94a3b8] mt-1">
          Tag each scene with the production elements it needs — cast,
          props, vehicles, costume, makeup, fx, sound, music, locations.
        </p>
      </div>

      <BreakdownAggregate summary={summary} />

      <BreakdownWorkspace
        scenes={scenes}
        elementsByScene={elementsByScene}
        metaByScene={metaByScene}
      />
    </div>
  );
}
