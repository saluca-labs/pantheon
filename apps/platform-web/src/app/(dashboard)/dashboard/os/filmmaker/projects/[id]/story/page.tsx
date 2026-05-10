/**
 * Filmmaker OS — Story documents (project-scoped).
 *
 * Sidebar list of all story documents for a project, grouped by kind
 * (Bible / Treatment / Logline / Outline / Pitch Deck). Each kind has a
 * "+ New" affordance and empty-state CTA.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { getProject, listStoryDocuments } from '@/lib/agentic-os/filmmaker/repo';
import { StoryDocumentList } from '@/components/agentic-os/filmmaker/story/StoryDocumentList';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FilmmakerStoryListPage({ params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) notFound();

  const documents = await listStoryDocuments(id, user.tenantId, user.userId);

  return (
    <div className="max-w-4xl">
      <Link
        href={`/dashboard/os/filmmaker/projects/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to project
      </Link>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Story</p>
        <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
        <p className="text-sm text-[#94a3b8] mt-1">
          Bible, treatment, logline, outline, and pitch-deck text for this project.
        </p>
      </div>

      <StoryDocumentList projectId={id} initialDocuments={documents} />
    </div>
  );
}
