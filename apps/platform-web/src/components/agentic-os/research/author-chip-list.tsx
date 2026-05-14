/**
 * Research OS Phase 4 — ordered author chip list.
 *
 * Renders a horizontal strip of `AuthorChip`s in position order. Used
 * on paper cards (no position superscript) and the paper detail page
 * (with position numbers). Falls back to `authors_text` when no
 * structured authors are joined.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { Users } from 'lucide-react';
import type { OrderedAuthor } from '@/lib/agentic-os/research/paper-authors';
import { AuthorChip } from './author-chip';

interface Props {
  authors: OrderedAuthor[];
  /** Free-form fallback shown when `authors` is empty. */
  fallback?: string | null;
  /** Show position superscripts on each chip. */
  showPositions?: boolean;
  /** Optional link target — when present, each chip becomes a link. */
  hrefFor?: (authorId: string) => string;
}

export function AuthorChipList({ authors, fallback, showPositions, hrefFor }: Props) {
  if (authors.length === 0) {
    if (fallback && fallback.trim().length > 0) {
      return (
        <p
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary"
          data-testid="author-chip-list-fallback"
        >
          <Users className="w-3 h-3" />
          <span className="italic">{fallback}</span>
        </p>
      );
    }
    return (
      <p
        className="inline-flex items-center gap-1.5 text-xs text-text-secondary italic"
        data-testid="author-chip-list-empty"
      >
        <Users className="w-3 h-3" />
        No authors recorded
      </p>
    );
  }

  return (
    <div
      className="inline-flex flex-wrap items-center gap-1"
      data-testid="author-chip-list"
    >
      {authors.map((o) => (
        <AuthorChip
          key={o.link.id}
          author={o.author}
          position={showPositions ? o.link.position : undefined}
          href={hrefFor ? hrefFor(o.author.id) : undefined}
        />
      ))}
    </div>
  );
}
