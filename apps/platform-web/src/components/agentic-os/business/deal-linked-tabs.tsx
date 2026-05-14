'use client';

/**
 * Business OS — deal-detail linked-entity tabs.
 *
 * Wave D (UI Depth Wave) specialization: the deal-detail page used to render
 * an ad-hoc `<Link href="?tab=...">` strip with hand-rolled active styling and
 * per-tab `{activeTab === '...' && ...}` blocks. This replaces that with the
 * shared `CrossEntityTabs` primitive.
 *
 * Deep-linking is preserved: the active tab still syncs to the `?tab=` URL
 * search param. On mount the component seeds its active tab from the param
 * the server already validated; on tab change it pushes a shallow URL update
 * (`router.replace`, scroll-preserved) so existing `?tab=quotes` links keep
 * working and the browser back/forward buttons move between tabs. Tab panel
 * content is passed in pre-rendered from the server component, so no data
 * fetching moves to the client — same routes, same queries, same counts.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CrossEntityTabs, type CrossEntityTab } from '@/components/agentic-os/_shared/views';

interface Props {
  /** Pre-rendered tabs from the server component (label, count, content). */
  tabs: CrossEntityTab[];
  /** The `?tab=` value the server validated — seeds the initial active tab. */
  activeTab: string;
}

export default function DealLinkedTabs({ tabs, activeTab }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleTabChange = useCallback(
    (key: string) => {
      // Preserve deep-linking: mirror the active tab into `?tab=` so the URL
      // stays shareable and back/forward navigates tabs. `replace` keeps the
      // history tidy; `scroll: false` keeps the user's place on the page.
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div data-testid="deal-linked-tabs">
      <CrossEntityTabs
        tabs={tabs}
        activeKey={activeTab}
        onTabChange={handleTabChange}
        slug="business"
      />
    </div>
  );
}
