/**
 * Maker OS — Projects list page.
 *
 * Server component: loads the authenticated user's project list and hands it
 * to the `ProjectsManager` client component for filter/sort/create UI. Each
 * card links to the per-project hub at `/dashboard/os/maker/projects/[id]`.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import Link from 'next/link';
import { ArrowLeft, Wrench } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listProjects } from '@/lib/agentic-os/maker/repo';
import { ProjectsManager } from '@/components/agentic-os/maker/projects-manager';

export const dynamic = 'force-dynamic';

export default async function MakerProjectsPage() {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const projects = await listProjects(user.userId);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/maker"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Maker OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Wrench className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">My Projects</h1>
      </div>

      <p className="text-sm text-text-secondary mb-6">
        Hardware, electronics, and fabrication projects across the workshop. Each project
        tracks an 8-phase lifecycle (concept → design → procurement → fabrication → assembly →
        commissioning → done → archived) and carries its own parts inventory.
      </p>

      <ProjectsManager initialProjects={projects} />
    </div>
  );
}
