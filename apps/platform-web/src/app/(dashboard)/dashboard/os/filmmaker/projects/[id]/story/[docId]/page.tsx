/**
 * Filmmaker OS — Story document editor (per-document).
 *
 * Loads one story document + its version history and hands them to the
 * client editor workspace.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getProject,
  getStoryDocument,
  listStoryDocumentVersions,
} from '@/lib/agentic-os/filmmaker/repo';
import { StoryDocumentWorkspace } from '@/components/agentic-os/filmmaker/story/StoryDocumentWorkspace';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string; docId: string }>;
}

export default async function FilmmakerStoryDocumentPage({ params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { id, docId } = await params;
  const project = await getProject(id, user.userId);
  if (!project) notFound();

  const document = await getStoryDocument(docId, user.tenantId, user.userId);
  if (!document || document.projectId !== id) notFound();

  const versions = await listStoryDocumentVersions(docId, user.tenantId, user.userId);

  return (
    <div className="max-w-4xl">
      <Link
        href={`/dashboard/os/filmmaker/projects/${id}/story`}
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to story
      </Link>

      <StoryDocumentWorkspace
        document={document}
        projectId={id}
        initialVersions={versions}
      />
    </div>
  );
}
