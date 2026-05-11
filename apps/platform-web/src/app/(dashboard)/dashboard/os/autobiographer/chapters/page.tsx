import Link from 'next/link';
import { ArrowLeft, BookOpenText, Info } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { listChapters, listEvents } from '@/lib/agentic-os/autobiographer/repo';
import { ChapterEditor } from '@/components/agentic-os/autobiographer/chapter-editor';

export const dynamic = 'force-dynamic';

export default async function AutobiographerChaptersPage() {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const chapters = await listChapters(user.userId);
  // Show the most recent chapter in the editor, or start fresh
  const activeChapter = chapters[0] ?? null;
  const events = activeChapter ? await listEvents(activeChapter.id) : [];

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/autobiographer"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Autobiographer OS
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <BookOpenText className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Chapter Capture</h1>
      </div>
      <p className="text-sm text-[#94a3b8] mb-4">
        Write a chapter of your life story and attach structured life events to anchor it in time.
      </p>

      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 mb-6 flex items-start gap-3">
        <Info className="w-5 h-5 text-[#4361EE] shrink-0 mt-0.5" />
        <div className="text-xs text-[#cbd5e1] leading-relaxed">
          <p>
            <span className="font-medium text-white">
              The full chapter surface ships in Phase 4.
            </span>{' '}
            This is the legacy single-chapter editor from the original
            Autobiographer scaffold and continues to work for one-off chapter
            drafts.
          </p>
          <p className="mt-1">
            For the Phase 1 model, raw memory captures live at{' '}
            <Link
              href="/dashboard/os/autobiographer/memories"
              className="text-[#4361EE] hover:underline"
            >
              /autobiographer/memories
            </Link>
            , and books — the new per-OS project entity — live at{' '}
            <Link
              href="/dashboard/os/autobiographer"
              className="text-[#4361EE] hover:underline"
            >
              /autobiographer
            </Link>
            .
          </p>
        </div>
      </div>

      {chapters.length > 1 && (
        <p className="text-xs text-[#94a3b8] mb-6">
          You have {chapters.length} chapters.{' '}
          Editing the most recently updated one. Future versions will let you switch chapters.
        </p>
      )}

      <ChapterEditor initial={activeChapter} events={events} />
    </div>
  );
}
