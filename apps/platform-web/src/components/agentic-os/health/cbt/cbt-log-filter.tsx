'use client';

/**
 * CbtLogFilter — the kind-filter rail for the CBT logs list page (Wave C-1b
 * adoption).
 *
 * Replaces the ad-hoc `FilterChip` row with the shared `SavedViews` primitive.
 * Behavior-preserving: filtering is still URL-driven (`?kind=`) and each view
 * navigates exactly where the old chips did — `SavedViews` here is a
 * presentation swap, not a state-model change. Views are fixed (the seven CBT
 * kinds), so the save / delete affordances are intentionally not wired.
 */

import { useRouter } from 'next/navigation';
import { SavedViews, type SavedView } from '@/components/agentic-os/_shared/views';

/** The opaque query shape SavedViews carries — just the URL to navigate to. */
interface CbtKindQuery {
  href: string;
}

export interface CbtLogFilterProps {
  /** Ordered [kindValue, label] pairs for the seven CBT kinds. */
  kinds: { value: string; label: string }[];
  /** The currently-applied kind, or null for the "All" view. */
  activeKind: string | null;
}

export function CbtLogFilter({ kinds, activeKind }: CbtLogFilterProps) {
  const router = useRouter();

  const views: SavedView<CbtKindQuery>[] = kinds.map((k) => ({
    id: k.value,
    name: k.label,
    query: { href: `/dashboard/os/health/cbt/logs?kind=${k.value}` },
  }));

  return (
    <SavedViews<CbtKindQuery>
      slug="health"
      views={views}
      activeViewId={activeKind}
      currentQuery={{ href: '' }}
      allViewsLabel="All"
      onClearView={() => router.push('/dashboard/os/health/cbt/logs')}
      onSelectView={(view) => router.push(view.query.href)}
      // Views are a fixed preset list — saving / deleting is intentionally
      // not offered, so these are no-ops the primitive never surfaces.
      onSaveView={() => {}}
    />
  );
}
