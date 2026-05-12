/**
 * Research OS Phase 2 — Entry-kind pill.
 *
 * Small color-coded pill used by the timeline card header + the filter
 * chips strip. Resolves the icon name from `entry-kinds.ts` to a
 * `lucide-react` component so the lib layer stays React-free.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import {
  StickyNote,
  Eye,
  CheckCircle2,
  GitFork,
  HelpCircle,
  Square,
  type LucideIcon,
} from 'lucide-react';
import {
  ENTRY_KIND_LABELS,
  ENTRY_KIND_COLOR,
  ENTRY_KIND_ICON,
  type EntryKind,
} from '@/lib/agentic-os/research/entry-kinds';

const ICONS: Record<string, LucideIcon> = {
  StickyNote,
  Eye,
  CheckCircle2,
  GitFork,
  HelpCircle,
  Square,
};

interface Props {
  kind: EntryKind;
  size?: 'sm' | 'md';
}

export function NotebookEntryKindPill({ kind, size = 'sm' }: Props) {
  const Icon = ICONS[ENTRY_KIND_ICON[kind]] ?? StickyNote;
  const sizing =
    size === 'md'
      ? 'text-xs px-2 py-0.5'
      : 'text-[10px] px-1.5 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium uppercase tracking-wide rounded-full border ${sizing} ${ENTRY_KIND_COLOR[kind]}`}
      data-testid={`entry-kind-pill-${kind}`}
    >
      <Icon className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
      {ENTRY_KIND_LABELS[kind]}
    </span>
  );
}
