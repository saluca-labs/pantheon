/**
 * Autobiographer OS — person detail + edit page.
 *
 * Surfaces the full person row: cover image, relation, lifespan, consent
 * state + last-recorded attribution, notes, alias chips, the list of
 * memories that mention this person (with role chips + book attribution),
 * and the books they appear in (via memory→book join).
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  Tag as TagIcon,
  BookOpenText,
  User2,
} from 'lucide-react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getPersonWithCounts } from '@/lib/agentic-os/autobiographer/people-repo';
import {
  listMemoriesForPerson,
  listBooksForPerson,
} from '@/lib/agentic-os/autobiographer/memory-people-repo';
import { ConsentBadge } from '@/components/agentic-os/autobiographer/consent-badge';
import { PersonEditButton } from '@/components/agentic-os/autobiographer/person-edit-button';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

function lifespan(birth: number | null, death: number | null): string | null {
  if (birth === null && death === null) return null;
  if (birth !== null && death !== null) return `${birth} – ${death}`;
  if (birth !== null) return `b. ${birth}`;
  return `d. ${death}`;
}

export default async function PersonDetailPage({ params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const person = await getPersonWithCounts(id, user.userId);
  if (!person) notFound();

  const [memories, books] = await Promise.all([
    listMemoriesForPerson(id, user.userId),
    listBooksForPerson(id, user.userId),
  ]);

  const yrs = lifespan(person.birthYear, person.deathYear);

  return (
    <div className="max-w-3xl space-y-5">
      <Link
        href="/dashboard/os/autobiographer/people"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All people
      </Link>

      <header className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-start gap-4">
          {person.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.imageUrl}
              alt=""
              className="w-20 h-20 rounded-full object-cover border border-border-subtle shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-accent/15 to-surface-2 border border-border-subtle flex items-center justify-center shrink-0">
              <User2 className="w-8 h-8 text-accent/60" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-white">
                  {person.canonicalName}
                </h1>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-text-secondary">
                  {person.relation && (
                    <span className="inline-flex items-center gap-1">
                      <TagIcon className="w-3.5 h-3.5" />
                      {person.relation}
                    </span>
                  )}
                  {yrs && <span>{yrs}</span>}
                  <ConsentBadge state={person.consentToPublish} size="md" />
                </div>
              </div>
              <PersonEditButton
                person={{
                  id: person.id,
                  canonicalName: person.canonicalName,
                  aliases: person.aliases,
                  relation: person.relation,
                  birthYear: person.birthYear,
                  deathYear: person.deathYear,
                  consentToPublish: person.consentToPublish,
                  consentRecordedBy: person.consentRecordedBy,
                  notes: person.notes,
                  imageUrl: person.imageUrl,
                }}
              />
            </div>

            {person.aliases.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] uppercase tracking-wide text-text-secondary mr-1">
                  Aliases
                </span>
                {person.aliases.map((a) => (
                  <span
                    key={a}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-primary"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}

            {person.notes && (
              <p className="text-sm text-text-primary/80 mt-3 leading-relaxed">
                {person.notes}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Consent history (Phase 2 surfaces only the latest record; Phase 6
          adds a full history table). */}
      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <h2 className="text-sm uppercase tracking-wide text-text-secondary mb-3">
          Consent
        </h2>
        <div className="text-sm text-text-primary space-y-1">
          <p>
            Current state:{' '}
            <ConsentBadge state={person.consentToPublish} size="md" />
          </p>
          {person.consentRecordedAt && (
            <p className="text-xs text-text-secondary">
              Last recorded {new Date(person.consentRecordedAt).toLocaleString()}
              {person.consentRecordedBy ? ` — ${person.consentRecordedBy}` : ''}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <h2 className="text-sm uppercase tracking-wide text-text-secondary mb-3 inline-flex items-center gap-1.5">
          <Calendar className="w-4 h-4" />
          Memories mentioning {person.canonicalName} ({memories.length})
        </h2>
        {memories.length === 0 ? (
          <p className="text-xs text-[#64748b] italic">
            No memories link to this person yet. Open a memory and use the
            People picker to add them.
          </p>
        ) : (
          <ul className="space-y-2">
            {memories.map((m) => (
              <li
                key={m.memoryId}
                className="rounded border border-border-subtle bg-surface-0 px-3 py-2"
              >
                <Link
                  href={`/dashboard/os/autobiographer/memories/${m.memoryId}`}
                  className="text-sm text-white hover:text-accent transition"
                >
                  {m.title}
                </Link>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-text-secondary">
                  {(m.whenInLife || m.eraDateEstimate) && (
                    <span>{m.whenInLife ?? m.eraDateEstimate}</span>
                  )}
                  {m.role && (
                    <span className="px-1.5 py-0.5 rounded bg-surface-2 border border-border-subtle text-text-primary">
                      {m.role}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <h2 className="text-sm uppercase tracking-wide text-text-secondary mb-3 inline-flex items-center gap-1.5">
          <BookOpenText className="w-4 h-4" />
          Books they appear in
        </h2>
        {books.length === 0 ? (
          <p className="text-xs text-[#64748b] italic">
            They don&apos;t appear in any books yet. Memories must be
            attached to a book for it to show up here. Phase 4 will add the
            chapter axis as well.
          </p>
        ) : (
          <ul className="space-y-2">
            {books.map((b) => (
              <li
                key={b.bookId}
                className="flex items-center justify-between rounded border border-border-subtle bg-surface-0 px-3 py-2"
              >
                <Link
                  href={`/dashboard/os/autobiographer/books/${b.bookId}`}
                  className="text-sm text-white hover:text-accent transition"
                >
                  {b.bookTitle}
                </Link>
                <span className="text-[10px] text-text-secondary">
                  {b.memoryCount}{' '}
                  {b.memoryCount === 1 ? 'memory' : 'memories'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
