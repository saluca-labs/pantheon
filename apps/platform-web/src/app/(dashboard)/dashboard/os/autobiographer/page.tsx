/**
 * Autobiographer OS — dashboard hub.
 *
 * Replaces the registry-driven [slug] fallback for autobiographer. Phase 1
 * surfaces:
 *   - Books grid (cards w/ cover image, title, status, progress, target date)
 *   - "New book" CTA
 *   - Quick-link card to workshop-global memory captures
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpenText, NotebookPen, Users } from 'lucide-react';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { listBooks } from '@/lib/agentic-os/autobiographer/books-repo';
import { listMemories } from '@/lib/agentic-os/autobiographer/memories-repo';
import { listPeople } from '@/lib/agentic-os/autobiographer/people-repo';
import { BookList } from '@/components/agentic-os/autobiographer/book-list';
import { BookActions } from '@/components/agentic-os/autobiographer/book-actions';

export const dynamic = 'force-dynamic';

const AUTO_SLUG = 'autobiographer';

export default async function AutobiographerHubPage() {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(AUTO_SLUG);
  if (!mod) {
    throw new Error('Autobiographer OS module missing from registry');
  }

  const [books, recentMemories, people] = await Promise.all([
    listBooks({ userId: user.userId, limit: 50 }),
    listMemories({ userId: user.userId, limit: 5 }),
    listPeople({ userId: user.userId, limit: 5 }),
  ]);

  const cards = books.map((b) => ({
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    description: b.description,
    status: b.status,
    tags: b.tags,
    coverImageUrl: b.coverImageUrl,
    targetCompletionDate: b.targetCompletionDate,
    phaseProgress: b.phaseProgress,
  }));

  return (
    <div className="max-w-5xl space-y-6">
      <Link
        href="/dashboard/os"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All Agentic OS modules
      </Link>

      <header className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-surface-0 p-2.5 border border-border-subtle">
            <BookOpenText className="w-6 h-6 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h1 className="text-xl font-semibold text-white">{mod.label}</h1>
              <BookActions />
            </div>
            <p className="text-text-secondary text-sm">{mod.tagline}</p>
            <p className="text-sm text-text-primary/80 mt-2 leading-relaxed">
              {mod.description}
            </p>
          </div>
        </div>
      </header>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Your books</h2>
          <span className="text-xs text-text-secondary">
            {books.length} {books.length === 1 ? 'book' : 'books'}
          </span>
        </div>
        <BookList initial={cards} />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Workshop</h2>
          <span className="text-xs text-text-secondary">
            Memories are workshop-global — they fuel ghostwriting across every
            book.
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            href="/dashboard/os/autobiographer/memories"
            className="group block rounded-xl border border-border-subtle bg-surface-2 p-5 hover:border-accent/60 hover:bg-surface-3 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-surface-0 p-2 border border-border-subtle">
                  <NotebookPen className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <div className="text-base font-semibold text-white mb-1">
                    Memory captures
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    Raw memory atoms with markdown body, era labels, location,
                    emotion + content tags, and optional audio/photo references.
                    Filterable by book, sensitivity, and tag.
                  </p>
                  {recentMemories.length > 0 && (
                    <p className="text-xs text-[#64748b] mt-2">
                      Most recent: {recentMemories[0]!.title}
                    </p>
                  )}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-text-secondary group-hover:text-accent mt-1 shrink-0 transition" />
            </div>
          </Link>

          <Link
            href="/dashboard/os/autobiographer/people"
            className="group block rounded-xl border border-border-subtle bg-surface-2 p-5 hover:border-accent/60 hover:bg-surface-3 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-surface-0 p-2 border border-border-subtle">
                  <Users className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <div className="text-base font-semibold text-white mb-1">
                    People
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    Workshop-global directory of who appears in your memories
                    — family, friends, mentors, public figures — with the
                    consent state Phase 6 will gate publication on.
                  </p>
                  {people.length > 0 && (
                    <p className="text-xs text-[#64748b] mt-2">
                      {people.length}{' '}
                      {people.length === 1 ? 'person' : 'people'} on file
                    </p>
                  )}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-text-secondary group-hover:text-accent mt-1 shrink-0 transition" />
            </div>
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-white mb-3">More surfaces</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {mod.features
            .filter(
              (f) =>
                f.href !== '/dashboard/os/autobiographer' &&
                f.href !== '/dashboard/os/autobiographer/memories' &&
                f.href !== '/dashboard/os/autobiographer/people',
            )
            .map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className="group rounded-xl border border-border-subtle bg-surface-2 p-4 hover:border-accent/60 hover:bg-surface-3 transition flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white mb-1">
                    {feature.label}
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-secondary group-hover:text-accent mt-1 shrink-0 transition" />
              </Link>
            ))}
        </div>
      </section>
    </div>
  );
}
