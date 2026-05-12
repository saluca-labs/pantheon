/**
 * Research OS Phase 4 — Literature library page.
 *
 * Server component: loads the workshop-global papers list and renders
 * the client-side filter chips + search + grid via `PaperList`.
 * Surface also shows an inline "Add paper" CTA that toggles the form.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import Link from 'next/link';
import { ArrowLeft, BookOpenText, Plus } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { listPapers } from '@/lib/agentic-os/research/papers-repo';
import { PaperList } from '@/components/agentic-os/research/paper-list';
import { LibraryPageActions } from '@/components/agentic-os/research/library-page-actions';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ new?: string }>;
}

export default async function LiteratureLibraryPage({ searchParams }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const showNew = sp.new === '1';

  const papers = await listPapers(user.userId, { limit: 200 });

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/research"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Research OS
      </Link>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <BookOpenText className="w-6 h-6 text-[#4361EE]" />
          <h1 className="text-2xl font-semibold text-white">Literature library</h1>
        </div>
        <Link
          href="/dashboard/os/research/authors"
          className="inline-flex items-center gap-1.5 text-xs text-[#4361EE] hover:underline"
        >
          Authors
          <ArrowLeft className="w-3 h-3 rotate-180" />
        </Link>
      </div>

      <p className="text-sm text-[#94a3b8] mb-6">
        Workshop-global catalogue of papers, preprints, theses, and other
        literature. Paste a DOI / arXiv ID or fill the form manually — Phase 4
        does no remote metadata fetch. Link papers to experiments from the
        per-experiment Literature tab.
      </p>

      <LibraryPageActions initialShowNew={showNew} />

      <div className="mt-6">
        <PaperList initialPapers={papers} />
      </div>
    </div>
  );
}
