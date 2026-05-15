/**
 * Research OS Phase 4 — paper-kind pill.
 *
 * Small color-coded pill rendered on paper cards, the paper detail
 * header, and the kind filter chips. Resolves an icon per kind.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import {
  FileText,
  FileSearch,
  GraduationCap,
  BookOpen,
  BookMarked,
  Database,
  ScrollText,
  Pencil,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import {
  PAPER_KIND_LABELS,
  type PaperKind,
} from '@/lib/agentic-os/research/paper-kinds';

const ICONS: Record<PaperKind, LucideIcon> = {
  paper: FileText,
  preprint: FileSearch,
  thesis: GraduationCap,
  book: BookOpen,
  chapter: BookMarked,
  dataset_paper: Database,
  report: ScrollText,
  blog: Pencil,
  other: Sparkles,
};

const COLORS: Record<PaperKind, string> = {
  paper: 'bg-accent/15 border-accent/40 text-accent',
  preprint: 'bg-warning/15 border-warning/40 text-warning',
  thesis: 'bg-os-creator/15 border-os-creator/40 text-os-creator',
  book: 'bg-positive/15 border-positive/40 text-positive',
  chapter: 'bg-os-research/15 border-os-research/40 text-os-research',
  dataset_paper: 'bg-os-research/15 border-os-research/40 text-os-research',
  report: 'bg-attention/15 border-attention/40 text-attention',
  blog: 'bg-os-creator/15 border-os-creator/40 text-os-creator',
  other: 'bg-text-secondary/15 border-text-secondary/40 text-text-secondary',
};

interface Props {
  kind: PaperKind;
  size?: 'sm' | 'md';
}

export function PaperKindPill({ kind, size = 'sm' }: Props) {
  const Icon = ICONS[kind] ?? FileText;
  const sizing =
    size === 'md' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5';
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium uppercase tracking-wide rounded-full border ${sizing} ${COLORS[kind]}`}
      data-testid={`paper-kind-pill-${kind}`}
    >
      <Icon className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
      {PAPER_KIND_LABELS[kind]}
    </span>
  );
}
