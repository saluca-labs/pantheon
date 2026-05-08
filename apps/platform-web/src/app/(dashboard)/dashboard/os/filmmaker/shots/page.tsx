import Link from 'next/link';
import { ArrowLeft, Clapperboard } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { listProjects, listShots, createProject } from '@/lib/agentic-os/filmmaker/repo';
import { ShotListBuilder } from '@/components/agentic-os/filmmaker/shot-list-builder';

export const dynamic = 'force-dynamic';

export default async function FilmmakerShotsPage() {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  // Ensure the user has at least one project (auto-create if first visit).
  let projects = await listProjects(user.userId);
  if (projects.length === 0) {
    await createProject(user.userId, 'My First Film');
    projects = await listProjects(user.userId);
  }

  // Use the most-recently-updated project as the active context.
  const project = projects[0]!;
  const shots = await listShots(project.id);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/filmmaker"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Filmmaker OS
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Clapperboard className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Shot List Builder</h1>
      </div>
      <p className="text-sm text-[#94a3b8] mb-6">
        Project:{' '}
        <span className="text-white font-medium">{project.title}</span>
        {' · '}
        Shot types follow the{' '}
        <a
          href="https://www.ascmag.com/articles/shot-types-and-camera-angles"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-white"
        >
          ASC taxonomy
        </a>
        .
      </p>

      <ShotListBuilder projectId={project.id} initial={shots} />
    </div>
  );
}
