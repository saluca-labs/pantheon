/**
 * Research OS Phase 4 — Authors list page.
 *
 * Workshop-global authors index. Server component loads all authors
 * (capped at 1000) + the count of papers linked per author. Renders an
 * alphabetical A-Z rail-style group.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { listAuthors, authorPaperCounts } from '@/lib/agentic-os/research/authors-repo';
import { familyNameBucket } from '@/lib/agentic-os/research/authors';

export const dynamic = 'force-dynamic';

export default async function AuthorsListPage() {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  const authors = await listAuthors(user.userId, { limit: 1000 });
  const counts = await authorPaperCounts(
    user.userId,
    authors.map((a) => a.id),
  );

  // Bucket by first letter of family_name.
  const buckets = new Map<string, typeof authors>();
  for (const a of authors) {
    const b = familyNameBucket(a.familyName);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(a);
  }
  const sortedBuckets = Array.from(buckets.entries()).sort(([a], [b]) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/research"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Research OS
      </Link>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-semibold text-white">Authors</h1>
        </div>
        <Link
          href="/dashboard/os/research/library"
          className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
        >
          Literature library
          <ArrowLeft className="w-3 h-3 rotate-180" />
        </Link>
      </div>

      <p className="text-sm text-text-secondary mb-6">
        Workshop-global author index. Authors are added from the paper-form
        either inline (auto-create) or via the picker. Bucketed by family-name
        initial; ORCID dedupe is enforced per user.
      </p>

      {authors.length === 0 ? (
        <p
          className="text-sm text-text-secondary italic py-8 text-center"
          data-testid="authors-list-empty"
        >
          No authors yet. Add authors via a new paper&apos;s structured-authors
          picker.
        </p>
      ) : (
        <div className="space-y-6" data-testid="authors-list">
          {sortedBuckets.map(([bucket, list]) => (
            <section key={bucket} aria-labelledby={`authors-bucket-${bucket}`}>
              <h2
                id={`authors-bucket-${bucket}`}
                className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-2"
              >
                {bucket}
              </h2>
              <ul className="space-y-1">
                {list.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/dashboard/os/research/authors/${a.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border-subtle bg-surface-2 hover:border-accent/40 transition"
                      data-testid={`authors-list-row-${a.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{a.displayName}</p>
                        <p className="text-[10px] text-text-secondary truncate">
                          {[a.affiliation, a.orcid].filter(Boolean).join(' — ') ||
                            'No affiliation recorded'}
                        </p>
                      </div>
                      <span className="text-[10px] text-text-secondary shrink-0">
                        {counts[a.id] ?? 0} paper{(counts[a.id] ?? 0) === 1 ? '' : 's'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
