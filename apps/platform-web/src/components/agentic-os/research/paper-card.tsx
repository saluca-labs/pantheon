/**
 * Research OS Phase 4 — paper-list-row card.
 *
 * Per-row tile rendered on the library list. Title (→ detail link),
 * kind pill, year + venue, structured authors fallback to authors_text,
 * tags, optional preview snippet.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import Link from 'next/link';
import { Calendar, Link as LinkIcon, FileQuestion } from 'lucide-react';
import type { Paper } from '@/lib/agentic-os/research/papers';
import type { OrderedAuthor } from '@/lib/agentic-os/research/paper-authors';
import { PaperKindPill } from './paper-kind-pill';
import { AuthorChipList } from './author-chip-list';

interface Props {
  paper: Paper;
  authors?: OrderedAuthor[];
  /** When present, a small "Linked to N experiments" footer is shown. */
  linkedExperimentsCount?: number;
}

export function PaperCard({ paper, authors = [], linkedExperimentsCount }: Props) {
  return (
    <article
      className="rounded-xl border border-border-subtle bg-surface-2 p-4 hover:border-accent/40 transition"
      data-testid={`paper-card-${paper.id}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="min-w-0">
          <Link
            href={`/dashboard/os/research/library/${paper.id}`}
            className="text-base font-semibold text-white hover:underline truncate inline-block max-w-full"
            data-testid={`paper-card-title-${paper.id}`}
          >
            {paper.title}
          </Link>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <PaperKindPill kind={paper.kind} />
            {paper.year != null && (
              <span className="inline-flex items-center gap-1 text-[10px] text-text-secondary">
                <Calendar className="w-3 h-3" />
                {paper.year}
              </span>
            )}
            {paper.venue && (
              <span className="text-[10px] text-text-secondary truncate max-w-[40ch]">
                {paper.venue}
              </span>
            )}
            {paper.archivedAt && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-border-subtle bg-surface-0 text-text-secondary">
                Archived
              </span>
            )}
          </div>
        </div>
        {paper.url && (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline shrink-0"
            data-testid={`paper-card-url-${paper.id}`}
          >
            <LinkIcon className="w-3 h-3" />
            Open
          </a>
        )}
      </div>

      <div className="mt-2">
        <AuthorChipList authors={authors} fallback={paper.authorsText} />
      </div>

      {paper.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1" data-testid={`paper-card-tags-${paper.id}`}>
          {paper.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-text-secondary">
        <span className="inline-flex items-center gap-1">
          {paper.doi ? (
            <>DOI: <code className="text-text-primary">{paper.doi}</code></>
          ) : paper.arxivId ? (
            <>arXiv: <code className="text-text-primary">{paper.arxivId}</code></>
          ) : (
            <span className="inline-flex items-center gap-1">
              <FileQuestion className="w-3 h-3" />
              No identifier
            </span>
          )}
        </span>
        {linkedExperimentsCount != null && linkedExperimentsCount > 0 && (
          <span>
            Linked to {linkedExperimentsCount} experiment
            {linkedExperimentsCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </article>
  );
}
