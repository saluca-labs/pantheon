/**
 * Autobiographer coach — single citation chip (memory link).
 *
 * Renders one source memory as a small pill in the citation panel.
 * Clicking jumps to the memory detail surface. The truncation is
 * presentational; the underlying memory UUID stays opaque.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import Link from 'next/link';
import { NotebookPen } from 'lucide-react';

interface Props {
  memoryId: string;
  title?: string | null;
}

export function CoachCitationChip({ memoryId, title }: Props) {
  const label = title?.trim() || memoryId.slice(0, 8);
  return (
    <Link
      href={`/dashboard/os/autobiographer/memories?focus=${memoryId}`}
      className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-0 px-2 py-0.5 text-[10px] text-text-primary hover:border-accent/60 hover:text-white transition"
      title={memoryId}
    >
      <NotebookPen className="w-3 h-3 text-accent" />
      <span className="truncate max-w-[12rem]">{label}</span>
    </Link>
  );
}
