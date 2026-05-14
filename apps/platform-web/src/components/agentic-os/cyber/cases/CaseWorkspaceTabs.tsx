'use client';

/**
 * CyberSec OS — case-detail workspace tab strip.
 *
 * Wave D specialization. `CaseDetailWorkspace` already adopted the shared
 * `CrossEntityTabs` primitive in Wave C-2a, but it owned tab state internally
 * — the active tab was lost on refresh and not shareable. This island wraps
 * `CrossEntityTabs` in URL-synced (`?tab=`) deep-linking, the same pattern
 * Business D.1's `DealLinkedTabs` uses:
 *
 *  - The server component validates the `?tab=` value and passes it as
 *    `activeTab`, seeding the initial active tab.
 *  - On tab change the island pushes a shallow URL update (`router.replace`,
 *    `scroll: false`) so `?tab=evidence` links stay shareable and the browser
 *    back/forward buttons move between tabs.
 *  - Tab panel content is passed in pre-rendered from the workspace — no data
 *    fetching moves here, same routes / queries / counts.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CrossEntityTabs,
  type CrossEntityTab,
} from '@/components/agentic-os/_shared/views';

/** The case workspace's canonical tab keys, in display order. */
export const CASE_WORKSPACE_TABS = [
  'overview',
  'alerts',
  'evidence',
  'tasks',
  'timeline',
] as const;

export type CaseWorkspaceTabKey = (typeof CASE_WORKSPACE_TABS)[number];

/** Normalize an arbitrary `?tab=` value to a valid workspace tab key. */
export function normalizeCaseTab(raw: string | undefined | null): CaseWorkspaceTabKey {
  return CASE_WORKSPACE_TABS.includes(raw as CaseWorkspaceTabKey)
    ? (raw as CaseWorkspaceTabKey)
    : 'overview';
}

interface Props {
  /** Pre-rendered tabs from the workspace (label, count, content). */
  tabs: CrossEntityTab[];
  /** The `?tab=` value the server validated — seeds the initial active tab. */
  activeTab: string;
}

export function CaseWorkspaceTabs({ tabs, activeTab }: Props) {
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
    <div data-testid="case-workspace-tabs">
      <CrossEntityTabs
        tabs={tabs}
        activeKey={activeTab}
        onTabChange={handleTabChange}
        slug="cyber"
      />
    </div>
  );
}
