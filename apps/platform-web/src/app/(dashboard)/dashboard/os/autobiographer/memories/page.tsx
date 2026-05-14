/**
 * Autobiographer OS — workshop-global memory captures list.
 *
 * Surfaces every memory the user has captured (across books and unattached)
 * with client-side filters on book scope, sensitive flag, and tag chips.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, NotebookPen } from 'lucide-react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { listMemories } from '@/lib/agentic-os/autobiographer/memories-repo';
import { listBooks } from '@/lib/agentic-os/autobiographer/books-repo';
import { MemoryList } from '@/components/agentic-os/autobiographer/memory-list';
import { MemoryActions } from '@/components/agentic-os/autobiographer/memory-actions';

export const dynamic = 'force-dynamic';

export default async function AutobiographerMemoriesPage() {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const [memories, books] = await Promise.all([
    listMemories({ userId: user.userId, limit: 100 }),
    listBooks({ userId: user.userId, limit: 50 }),
  ]);

  const cards = memories.map((m) => ({
    id: m.id,
    bookId: m.bookId,
    title: m.title,
    bodyMarkdown: m.bodyMarkdown,
    whenInLife: m.whenInLife,
    eraDateEstimate: m.eraDateEstimate,
    location: m.location,
    contentTags: m.contentTags,
    emotionTags: m.emotionTags,
    isSensitive: m.isSensitive,
    source: m.source,
    photoUrls: m.photoUrls,
    audioUrl: m.audioUrl,
    updatedAt: m.updatedAt,
  }));

  const bookOptions = books.map((b) => ({ id: b.id, title: b.title }));

  return (
    <div className="max-w-4xl space-y-5">
      <Link
        href="/dashboard/os/autobiographer"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Autobiographer OS
      </Link>

      <header className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-surface-0 p-2.5 border border-border-subtle">
            <NotebookPen className="w-6 h-6 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h1 className="text-xl font-semibold text-white">
                Memory captures
              </h1>
              <MemoryActions books={bookOptions} />
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Workshop-global capture surface. Memories live independently of
              books — attach a memory to one or more books to use it in a
              future ghostwritten chapter, or keep it free-floating for now.
            </p>
          </div>
        </div>
      </header>

      <MemoryList initial={cards} books={bookOptions} />
    </div>
  );
}
