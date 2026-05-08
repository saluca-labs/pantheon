/**
 * Filmmaker OS — Shot List Builder page.
 *
 * Reads `?projectId` from search params. If a real project ID is supplied the
 * shot list for that project is loaded. If no projectId is provided the user
 * is shown a project selector with a link back to /projects.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { ArrowLeft, Clapperboard, FolderOpen } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { listProjects, listShots } from '@/lib/agentic-os/filmmaker/repo';
import { ShotListBuilder } from '@/components/agentic-os/filmmaker/shot-list-builder';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function FilmmakerShotsPage({ searchParams }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { projectId } = await searchParams;

  // If a projectId was provided, load that specific project.
  if (projectId) {
    const projects = await listProjects(user.userId);
    const project = projects.find((p) => p.id === projectId) ?? null;

    if (!project) {
      // Unknown / unauthorized projectId — fall back to selector.
      return <ProjectSelector userId={user.userId} />;
    }

    const shots = await listShots(project.id);

    return (
      <div className="max-w-4xl">
        <Link
          href="/dashboard/os/filmmaker/projects"
          className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>

        <div className="flex items-center gap-3 mb-1">
          <Clapperboard className="w-6 h-6 text-[#4361EE]" />
          <h1 className="text-2xl font-semibold text-white">Shot List Builder</h1>
        </div>
        <p className="text-sm text-[#94a3b8] mb-6">
          Project:{' '}
          <span className="text-white font-medium">{project.name}</span>
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

  // No projectId — show project selector.
  return <ProjectSelector userId={user.userId} />;
}

// ─── Project Selector ─────────────────────────────────────────────────────────

async function ProjectSelector({ userId }: { userId: string }) {
  const projects = await listProjects(userId);

  return (
    <div className="max-w-2xl">
      <Link
        href="/dashboard/os/filmmaker"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Filmmaker OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <FolderOpen className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Select a Project</h1>
      </div>

      <p className="text-sm text-[#94a3b8] mb-6">
        Choose a project to open its shot list, or{' '}
        <Link
          href="/dashboard/os/filmmaker/projects"
          className="text-[#4361EE] hover:underline"
        >
          manage your projects
        </Link>
        .
      </p>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6 text-center">
          <p className="text-sm text-[#94a3b8] mb-4">No projects yet.</p>
          <Link
            href="/dashboard/os/filmmaker/projects"
            className="inline-flex items-center gap-2 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white font-medium px-4 py-2 text-sm transition"
          >
            <FolderOpen className="w-4 h-4" />
            Create your first project
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/os/filmmaker/shots?projectId=${p.id}`}
              className="flex items-center justify-between rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/50 transition group"
            >
              <div>
                <p className="text-white font-medium group-hover:text-[#4361EE] transition">
                  {p.name}
                </p>
                {p.description && (
                  <p className="text-sm text-[#94a3b8] mt-0.5 truncate max-w-sm">{p.description}</p>
                )}
              </div>
              <span className="text-xs text-[#94a3b8] group-hover:text-white transition">
                Open →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
