/**
 * Research OS Phase 4 — Author detail page.
 *
 * Server component: author header + their linked papers list.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft, User as UserIcon, Building2, IdCard } from 'lucide-react';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { getAuthor } from '@/lib/agentic-os/research/authors-repo';
import { getResearchPool } from '@/lib/agentic-os/research/session';
import type { Paper } from '@/lib/agentic-os/research/papers';
import { asPaperKind } from '@/lib/agentic-os/research/paper-kinds';
import { PaperCard } from '@/components/agentic-os/research/paper-card';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

async function listPapersForAuthor(authorId: string, userId: string): Promise<Paper[]> {
  const pool = getResearchPool();
  interface RawPaperRow {
    id: string;
    user_id: string;
    title: string;
    kind: string | null;
    doi: string | null;
    arxiv_id: string | null;
    url: string | null;
    authors_text: string | null;
    venue: string | null;
    year: number | string | null;
    abstract_md: string | null;
    tags: unknown;
    metadata: unknown;
    archived_at: Date | string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }
  const r = await pool.query<RawPaperRow>(
    `SELECT p.id, p.user_id, p.title, p.kind, p.doi, p.arxiv_id, p.url,
            p.authors_text, p.venue, p.year, p.abstract_md, p.tags,
            p.metadata, p.archived_at, p.created_at, p.updated_at,
            pa.position AS position
       FROM agos_research_paper_authors pa
       JOIN agos_research_papers p ON p.id = pa.paper_id
      WHERE pa.author_id = $1
        AND p.user_id = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_authors a
               WHERE a.id = pa.author_id AND a.user_id = $2
            )
      ORDER BY p.updated_at DESC`,
    [authorId, userId],
  );
  return r.rows.map(
    (row): Paper => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      kind: asPaperKind(row.kind) ?? 'paper',
      doi: row.doi ?? null,
      arxivId: row.arxiv_id ?? null,
      url: row.url ?? null,
      authorsText: row.authors_text ?? null,
      venue: row.venue ?? null,
      year: row.year == null ? null : Number(row.year),
      abstractMd: row.abstract_md ?? null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      archivedAt:
        row.archived_at == null
          ? null
          : row.archived_at instanceof Date
            ? row.archived_at.toISOString()
            : String(row.archived_at),
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt:
        row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    }),
  );
}

export default async function AuthorDetailPage({ params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const author = await getAuthor(id, user.userId);
  if (!author) notFound();

  const papers = await listPapersForAuthor(id, user.userId);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/research/authors"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All authors
      </Link>

      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-surface-0 border border-border-subtle flex items-center justify-center">
            <UserIcon className="w-6 h-6 text-accent" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-white" data-testid="author-detail-name">
              {author.displayName}
            </h1>
            {(author.givenName || author.familyName) && (
              <p className="text-xs text-text-secondary">
                {[author.givenName, author.familyName].filter(Boolean).join(' ')}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-secondary">
          {author.affiliation && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {author.affiliation}
            </span>
          )}
          {author.orcid && (
            <span className="inline-flex items-center gap-1">
              <IdCard className="w-3 h-3" />
              <code className="text-text-primary">{author.orcid}</code>
            </span>
          )}
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
          Linked papers ({papers.length})
        </h2>
        {papers.length === 0 ? (
          <p
            className="text-sm text-text-secondary italic py-8 text-center"
            data-testid="author-detail-papers-empty"
          >
            No papers link this author yet.
          </p>
        ) : (
          <div
            className="grid grid-cols-1 lg:grid-cols-2 gap-3"
            data-testid="author-detail-papers"
          >
            {papers.map((p) => (
              <PaperCard key={p.id} paper={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
