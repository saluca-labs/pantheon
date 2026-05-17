/**
 * Autobiographer OS — Privacy hub page.
 *
 * Per-book privacy review surface. Three panels per book:
 *
 *   - People roster — every person referenced in this book's memories,
 *     consent state, link to the Phase 2 person detail page.
 *   - Pseudonym map editor — per-person replacement-name editor.
 *   - Review checklist — book-level + per-chapter, grouped by chapter.
 *
 * No book selected → renders a book picker. Selecting a book reloads
 * with `?bookId=<id>` in the URL so the surface is bookmarkable.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, BookOpenText, ShieldCheck } from 'lucide-react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getAutobiographerPool } from '@/lib/agentic-os/autobiographer/session';
import { listBooks, getBook } from '@/lib/agentic-os/autobiographer/books-repo';
import { listPseudonymsForBook } from '@/lib/agentic-os/autobiographer/pseudonyms-repo';
import { listReviewChecksForBookGrouped } from '@/lib/agentic-os/autobiographer/review-checks-repo';
import {
  chapterHasSensitiveContent,
  listChaptersForBook,
} from '@/lib/agentic-os/autobiographer/chapters-repo';
import { PrivacyReviewWizard } from '@/components/agentic-os/autobiographer/privacy-review-wizard';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import type { ConsentState } from '@/lib/agentic-os/autobiographer/people';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface BookPersonRow {
  personId: string;
  canonicalName: string;
  aliases: string[];
  consentState: ConsentState;
  memoryCount: number;
}

/**
 * People referenced in a book: walk memories → memory_people for the
 * book's attached memories AND for memories whose chapter_sources link
 * back to the book. Deduped + counted.
 */
async function listPeopleForBook(
  bookId: string,
  userId: string,
): Promise<BookPersonRow[]> {
  const pool = getAutobiographerPool();
  // Two paths into a book:
  //   1. memory.book_id = bookId (direct attachment)
  //   2. chapter_sources joining a chapter in the book to a memory
  interface RawPersonRow {
    id: string;
    canonical_name: string;
    aliases: unknown;
    consent_to_publish: string | null;
    memory_count: number | string | null;
  }
  const r = await pool.query<RawPersonRow>(
    `WITH book_memories AS (
       SELECT id FROM agos_autobiographer_memories
        WHERE user_id = $2 AND book_id = $1
       UNION
       SELECT s.memory_id AS id
         FROM agos_autobiographer_chapter_sources s
         JOIN agos_autobiographer_chapters c ON c.id = s.chapter_id
        WHERE c.book_id = $1 AND c.user_id = $2
     )
     SELECT p.id, p.canonical_name, p.aliases, p.consent_to_publish,
            COUNT(mp.memory_id)::int AS memory_count
       FROM agos_autobiographer_memory_people mp
       JOIN book_memories bm ON bm.id = mp.memory_id
       JOIN agos_autobiographer_people p ON p.id = mp.person_id
      WHERE p.user_id = $2
      GROUP BY p.id, p.canonical_name, p.aliases, p.consent_to_publish
      ORDER BY lower(p.canonical_name) ASC`,
    [bookId, userId],
  );
  return r.rows.map((row) => ({
    personId: row.id,
    canonicalName: row.canonical_name,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    consentState: (row.consent_to_publish as ConsentState) ?? 'pending',
    memoryCount: Number(row.memory_count ?? 0),
  }));
}

function pickOne(
  search: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = search[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function PrivacyHubPage({ searchParams }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');
  const search = await searchParams;
  const bookIdParam = pickOne(search, 'bookId');

  const books = await listBooks({ userId: user.userId, limit: 100 });

  if (!bookIdParam) {
    return (
      <div className="max-w-5xl space-y-4">
        <Link
          href="/dashboard/os/autobiographer"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Autobiographer OS
        </Link>

        <header className="rounded-xl border border-border-subtle bg-surface-2 p-5">
          <div className="inline-flex items-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-accent" />
            <h1 className="text-xl font-semibold text-white">Privacy review</h1>
          </div>
          <p className="text-sm text-text-primary leading-relaxed">
            Per-book consent audit, pseudonym map, and pre-publication review
            checklist. Required checks gate chapter lock and the "final" PDF
            export.
          </p>
        </header>

        <section className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white">Pick a book</h2>
          {books.length === 0 ? (
            <EmptyState
              variant="bare"
              icon={<BookOpenText className="h-6 w-6" />}
              title="No books yet"
              description="Create a book on the Autobiographer hub to run a privacy review against it."
              primaryCta={{
                label: 'Go to the hub',
                href: '/dashboard/os/autobiographer',
              }}
            />
          ) : (
            <ul className="space-y-1.5">
              {books.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/dashboard/os/autobiographer/privacy?bookId=${b.id}`}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded border border-border-subtle bg-surface-0 hover:border-accent/60 hover:bg-surface-3 transition"
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <BookOpenText className="w-4 h-4 text-accent shrink-0" />
                      <span className="truncate text-white text-sm">
                        {b.title}
                      </span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-text-secondary">
                      {b.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const book = await getBook(bookIdParam, user.userId);
  if (!book) {
    redirect('/dashboard/os/autobiographer/privacy');
  }

  const [people, pseudonyms, checks, chapters] = await Promise.all([
    listPeopleForBook(book.id, user.userId),
    listPseudonymsForBook(book.id, user.userId),
    listReviewChecksForBookGrouped(book.id, user.userId),
    listChaptersForBook({ userId: user.userId, bookId: book.id, order: 'position' }),
  ]);

  // Sensitive-content flag per chapter is a single round trip each;
  // for typical book sizes (<= a few dozen chapters) this stays well
  // under 100 ms in aggregate via parallel queries.
  const sensitivityFlags = await Promise.all(
    chapters.map((c) => chapterHasSensitiveContent(c.id, user.userId)),
  );

  // Pseudonym-by-personId lookup so the panel can hydrate existing rows.
  const pseudonymByPersonId = new Map(
    pseudonyms.map((p) => [p.personId, p] as const),
  );
  const pseudonymPeople = people.map((p) => {
    const existing = pseudonymByPersonId.get(p.personId);
    return {
      personId: p.personId,
      canonicalName: p.canonicalName,
      aliases: p.aliases,
      consentState: p.consentState,
      pseudonymId: existing?.id ?? null,
      pseudonym: existing?.pseudonym ?? '',
      notes: existing?.notes ?? null,
      applied: existing?.applied ?? false,
    };
  });

  // Reshape checks for the checklist panel.
  const checklistChapters = chapters.map((c, i) => ({
    chapterId: c.id,
    title: c.title ?? `Chapter ${c.position + 1}`,
    position: c.position,
    hasSensitiveContent: sensitivityFlags[i] ?? false,
    checks: (checks.byChapterId[c.id] ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      notes: row.notes,
      checkedAt: row.checkedAt,
    })),
  }));

  return (
    <div className="max-w-5xl space-y-4">
      <Link
        href="/dashboard/os/autobiographer/privacy"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Choose a different book
      </Link>

      <header className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="inline-flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <h1 className="text-xl font-semibold text-white">{book.title}</h1>
        </div>
        <p className="text-sm text-text-primary leading-relaxed">
          A guided privacy review for this book. Step through the people
          roster, the pseudonym map, and the review checklist; the final
          step gives you a readiness snapshot before locking chapters for
          export.
        </p>
      </header>

      <PrivacyReviewWizard
        bookId={book.id}
        people={people}
        pseudonymPeople={pseudonymPeople}
        bookLevelChecks={checks.book.map((row) => ({
          id: row.id,
          kind: row.kind,
          status: row.status,
          notes: row.notes,
          checkedAt: row.checkedAt,
        }))}
        chapters={checklistChapters}
      />
    </div>
  );
}
