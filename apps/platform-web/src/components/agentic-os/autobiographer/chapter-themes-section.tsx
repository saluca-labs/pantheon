/**
 * Autobiographer OS — ChapterThemesSection.
 *
 * Server-rendered section that hydrates the ThemePicker for a chapter.
 * Mirror of MemoryThemesSection.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { listThemesForChapter } from '@/lib/agentic-os/autobiographer/chapter-themes-repo';
import { listThemes } from '@/lib/agentic-os/autobiographer/themes-repo';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { ThemePicker, type PickerTheme } from './theme-picker';

export interface ChapterThemesSectionProps {
  chapterId: string;
}

function toPicker(t: {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}): PickerTheme {
  return { id: t.id, name: t.name, slug: t.slug, color: t.color };
}

export async function ChapterThemesSection({
  chapterId,
}: ChapterThemesSectionProps) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return null;
  const [linked, available] = await Promise.all([
    listThemesForChapter(chapterId, user.userId),
    listThemes({ userId: user.userId, limit: 500 }),
  ]);
  return (
    <ThemePicker
      entity="chapter"
      entityId={chapterId}
      linked={linked.map(toPicker)}
      available={available.map(toPicker)}
    />
  );
}
