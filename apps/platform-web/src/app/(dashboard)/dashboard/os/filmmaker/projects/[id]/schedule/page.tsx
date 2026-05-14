/**
 * Filmmaker OS — Stripboard schedule.
 *
 * Two-pane layout. Left: unscheduled scenes. Right: shooting days +
 * their strips. Drag-and-drop is faked with arrows + dropdown menus
 * per Phase 5b's no-@dnd-kit convention.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getProject,
  listShootingDays,
  getShootingDay,
  getUnscheduledScenes,
  getProjectScheduleSummary,
} from '@/lib/agentic-os/filmmaker/repo';
import { StripboardWorkspace } from '@/components/agentic-os/filmmaker/schedule/StripboardWorkspace';
import type { ShootingDayWithStrips } from '@/lib/agentic-os/filmmaker/schedule';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FilmmakerSchedulePage({ params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) notFound();

  const [bareDays, unscheduledScenes, summary] = await Promise.all([
    listShootingDays({ projectId: id, userId: user.userId }),
    getUnscheduledScenes(id, user.userId),
    getProjectScheduleSummary(id, user.userId),
  ]);

  const days: ShootingDayWithStrips[] = await Promise.all(
    bareDays.map(async (d) => {
      const full = await getShootingDay(d.id, user.userId);
      return full ?? { ...d, strips: [] };
    }),
  );

  return (
    <div className="max-w-7xl">
      <Link
        href={`/dashboard/os/filmmaker/projects/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to project
      </Link>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-text-secondary">Schedule</p>
        <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
        <p className="text-sm text-text-secondary mt-1">
          Drop scenes onto shooting days. Strips reorder with arrows;
          move across days with the dropdown menu on each strip.
        </p>
      </div>

      <StripboardWorkspace
        projectId={id}
        unscheduledScenes={unscheduledScenes}
        days={days}
        summary={summary}
      />
    </div>
  );
}
