/**
 * Autobiographer OS — ThemeList.
 *
 * Rendering helper for an inline list of theme chips. Used in memory
 * cards, chapter cards, timeline cards, and the themes index when the
 * caller wants the bare list of chips without a wrapper section.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { ThemeChip } from './theme-chip';

export interface ThemeListItem {
  id: string;
  name: string;
  slug?: string | null;
  color?: string | null;
}

export interface ThemeListProps {
  themes: ThemeListItem[];
  size?: 'sm' | 'md';
  /** Per-chip remove handler. */
  onRemove?: (themeId: string) => void;
  withIcon?: boolean;
  emptyText?: string;
}

export function ThemeList({
  themes,
  size = 'sm',
  onRemove,
  withIcon,
  emptyText,
}: ThemeListProps) {
  if (themes.length === 0) {
    if (!emptyText) return null;
    return (
      <span className="text-[10px] text-[#64748b] italic">{emptyText}</span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {themes.map((t) => (
        <ThemeChip
          key={t.id}
          name={t.name}
          slug={t.slug}
          color={t.color}
          size={size}
          withIcon={withIcon}
          onRemove={onRemove ? () => onRemove(t.id) : undefined}
        />
      ))}
    </div>
  );
}
