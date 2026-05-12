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
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-[#2a2d3e] bg-[#0f1117] text-[#cbd5e1] hover:border-[#4361EE]/40 transition"
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
      <UserIcon className="w-3 h-3 text-[#94a3b8]" />
      <span className="truncate max-w-[18ch]">{author.displayName}</span>
      {position != null && (
        <sup className="text-[9px] text-[#94a3b8] ml-0.5">#{position}</sup>
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
