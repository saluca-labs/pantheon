/**
 * Filmmaker OS — Projects page.
 *
 * Server component: loads the authenticated user's project list and hands it
 * to the ProjectsManager client component for interactive CRUD.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { ArrowLeft, Clapperboard } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { listProjects } from '@/lib/agentic-os/filmmaker/repo';
import { ProjectsManager } from '@/components/agentic-os/filmmaker/projects-manager';

export const dynamic = 'force-dynamic';

export default async function FilmmakerProjectsPage() {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const projects = await listProjects(user.userId);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/filmmaker"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Filmmaker OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Clapperboard className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">My Projects</h1>
      </div>

      <p className="text-sm text-[#94a3b8] mb-6">
        Manage your film projects across all production phases. Select a project to open its shot
        list builder. Status values follow industry-standard{' '}
        <a
          href="https://www.studiobinder.com/blog/pre-production/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-white"
        >
          pre-production → wrapped
        </a>{' '}
        phases.
      </p>

      <ProjectsManager initialProjects={projects} />
    </div>
  );
}
