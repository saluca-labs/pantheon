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
  paper: 'bg-blue-500/15 border-blue-500/40 text-blue-300',
  preprint: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  thesis: 'bg-purple-500/15 border-purple-500/40 text-purple-300',
  book: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  chapter: 'bg-teal-500/15 border-teal-500/40 text-teal-300',
  dataset_paper: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300',
  report: 'bg-orange-500/15 border-orange-500/40 text-orange-300',
  blog: 'bg-pink-500/15 border-pink-500/40 text-pink-300',
  other: 'bg-slate-500/15 border-slate-500/40 text-slate-300',
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
