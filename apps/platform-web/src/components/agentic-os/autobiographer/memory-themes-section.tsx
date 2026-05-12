/**
 * Autobiographer OS — MemoryThemesSection.
 *
 * Server-rendered section that hydrates the ThemePicker for a memory.
 * Resolves the currently-linked themes + the workshop's available
 * themes in parallel, then hands both to the client picker.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { listThemesForMemory } from '@/lib/agentic-os/autobiographer/memory-themes-repo';
import { listThemes } from '@/lib/agentic-os/autobiographer/themes-repo';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { ThemePicker, type PickerTheme } from './theme-picker';

export interface MemoryThemesSectionProps {
  memoryId: string;
}

function toPicker(t: {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}): PickerTheme {
  return { id: t.id, name: t.name, slug: t.slug, color: t.color };
}

export async function MemoryThemesSection({
  memoryId,
}: MemoryThemesSectionProps) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return null;
  const [linked, available] = await Promise.all([
    listThemesForMemory(memoryId, user.userId),
    listThemes({ userId: user.userId, limit: 500 }),
  ]);
  return (
    <ThemePicker
      entity="memory"
      entityId={memoryId}
      linked={linked.map(toPicker)}
      available={available.map(toPicker)}
    />
  );
}
