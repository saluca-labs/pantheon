/**
 * Research OS Phase 4 — single-author chip.
 *
 * Used inside `AuthorChipList` (paper detail / card) and as a building
 * block for the inline picker. Shows display name + optional position
 * superscript + ORCID/affiliation tooltip.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import Link from 'next/link';
import { User as UserIcon } from 'lucide-react';
import type { Author } from '@/lib/agentic-os/research/authors';

interface Props {
  author: Author;
  position?: number;
  href?: string;
}

export function AuthorChip({ author, position, href }: Props) {
  const inner = (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-border-subtle bg-surface-0 text-text-primary hover:border-accent/40 transition"
      title={
        [
          author.orcid ? `ORCID: ${author.orcid}` : null,
          author.affiliation ? author.affiliation : null,
        ]
          .filter(Boolean)
          .join(' — ') || author.displayName
      }
      data-testid={`author-chip-${author.id}`}
    >
      <UserIcon className="w-3 h-3 text-text-secondary" />
      <span className="truncate max-w-[18ch]">{author.displayName}</span>
      {position != null && (
        <sup className="text-[9px] text-text-secondary ml-0.5">#{position}</sup>
      )}
    </span>
  );
  if (href) {
    return (
      <Link href={href} className="inline-flex">
        {inner}
      </Link>
    );
  }
  return inner;
}
