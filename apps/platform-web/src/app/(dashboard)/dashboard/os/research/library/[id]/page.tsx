/**
 * Research OS Phase 4 — Paper detail page.
 *
 * Server component: hydrates the paper, ordered structured authors,
 * linked experiments (with relevance), and reading-notes integration
 * (notebook entries linked through Phase 3 evidence rows where
 * `source_kind='paper'` AND source_id=paper.id).
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  Link as LinkIcon,
  FlaskConical,
  BookOpen,
  ScrollText,
} from 'lucide-react';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { getPaper } from '@/lib/agentic-os/research/papers-repo';
import { listOrderedAuthorsForPaper } from '@/lib/agentic-os/research/paper-authors-repo';
import {
  listExperimentsLinkingPaper,
  listRelatedNotebookEntriesForPaper,
} from '@/lib/agentic-os/research/experiment-references-repo';
import { PaperKindPill } from '@/components/agentic-os/research/paper-kind-pill';
import { AuthorChipList } from '@/components/agentic-os/research/author-chip-list';
import { PaperAbstractCollapsible } from '@/components/agentic-os/research/paper-abstract-collapsible';
import { PaperArchiveButton } from '@/components/agentic-os/research/paper-archive-button';
import { REFERENCE_RELEVANCE_LABELS } from '@/lib/agentic-os/research/experiment-references';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PaperDetailPage({ params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const paper = await getPaper(id, user.userId);
  if (!paper) notFound();

  const [authors, linkingExperiments, relatedNotebookEntries] = await Promise.all([
    listOrderedAuthorsForPaper(id, user.userId),
    listExperimentsLinkingPaper(id, user.userId),
    listRelatedNotebookEntriesForPaper(id, user.userId),
  ]);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/research/library"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to library
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6 mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <PaperKindPill kind={paper.kind} size="md" />
              {paper.year != null && (
                <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                  <Calendar className="w-3 h-3" />
                  {paper.year}
                </span>
              )}
              {paper.venue && (
                <span className="text-xs text-text-secondary">{paper.venue}</span>
              )}
              {paper.archivedAt && (
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-border-subtle bg-surface-0 text-text-secondary">
                  Archived
                </span>
              )}
            </div>
            <h1 className="text-2xl font-semibold text-white" data-testid="paper-detail-title">
              {paper.title}
            </h1>
            <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-text-secondary">
              {paper.doi && (
                <span>
                  DOI: <code className="text-text-primary">{paper.doi}</code>
                </span>
              )}
              {paper.arxivId && (
                <span>
                  arXiv: <code className="text-text-primary">{paper.arxivId}</code>
                </span>
              )}
              {paper.url && (
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <LinkIcon className="w-3 h-3" />
                  Open
                </a>
              )}
            </div>
          </div>
          <PaperArchiveButton paper={paper} />
        </div>

        <div className="mt-4">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide mb-2">Authors</p>
          <AuthorChipList
            authors={authors}
            fallback={paper.authorsText}
            showPositions
            hrefFor={(authorId) => `/dashboard/os/research/authors/${authorId}`}
          />
        </div>

        {paper.tags.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] text-text-secondary uppercase tracking-wide mb-2">Tags</p>
            <div className="flex flex-wrap gap-1" data-testid="paper-detail-tags">
              {paper.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Abstract */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-2 inline-flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-accent" />
          Abstract
        </h2>
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
          <PaperAbstractCollapsible abstractMd={paper.abstractMd} />
        </div>
      </section>

      {/* Linked experiments */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-2 inline-flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-accent" />
          Linked experiments ({linkingExperiments.length})
        </h2>
        {linkingExperiments.length === 0 ? (
          <p
            className="text-sm text-text-secondary italic"
            data-testid="paper-detail-experiments-empty"
          >
            No experiments cite this paper yet. Visit an experiment&apos;s
            Literature tab to add a reference.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="paper-detail-experiments-list">
            {linkingExperiments.map((row) => (
              <li
                key={row.link.id}
                className="rounded-lg border border-border-subtle bg-surface-2 p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/os/research/experiments/${row.experiment.id}?tab=literature`}
                    className="text-sm font-semibold text-white hover:underline truncate"
                  >
                    {row.experiment.name}
                  </Link>
                  {row.link.notes && (
                    <p className="text-[10px] text-text-secondary mt-1">{row.link.notes}</p>
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-accent/40 bg-accent/15 text-text-primary shrink-0">
                  {REFERENCE_RELEVANCE_LABELS[row.link.relevance]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Related notebook entries (reading notes via Phase 3 evidence) */}
      <section>
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-2 inline-flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-accent" />
          Related notebook entries ({relatedNotebookEntries.length})
        </h2>
        {relatedNotebookEntries.length === 0 ? (
          <p
            className="text-sm text-text-secondary italic"
            data-testid="paper-detail-related-empty"
          >
            No notebook entries are linked to this paper via hypothesis-evidence
            yet. Link this paper to a hypothesis as <code>source_kind=paper</code>{' '}
            evidence to surface its reading-notes here.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="paper-detail-related-list">
            {relatedNotebookEntries.map((row) => (
              <li
                key={row.evidenceId}
                className="rounded-lg border border-border-subtle bg-surface-2 p-3"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    {row.notebookEntryId ? (
                      <p className="text-sm text-white truncate">
                        {row.notebookEntryTitle || '(untitled entry)'}
                      </p>
                    ) : (
                      <p className="text-sm text-text-secondary italic">
                        Evidence row without a paired notebook entry
                      </p>
                    )}
                    {row.notes && (
                      <p className="text-[10px] text-text-secondary mt-1">{row.notes}</p>
                    )}
                  </div>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-border-subtle bg-surface-0 text-text-primary shrink-0">
                    {row.polarity}
                  </span>
                </div>
                <div className="mt-2 text-[10px] text-text-secondary">
                  <Link
                    href={`/dashboard/os/research/hypotheses/${row.hypothesisId}`}
                    className="text-accent hover:underline"
                  >
                    Open hypothesis →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
