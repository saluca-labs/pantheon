'use client';

/**
 * CbtLogDetailTabs — the related-content tab strip for the CBT log detail
 * page (Wave C-1b adoption).
 *
 * Wraps the shared `CrossEntityTabs` primitive so the log's mood snapshot,
 * exercise detail, and free-text notes each get their own tab instead of
 * stacking in one card. Behavior-preserving: the panels are server-rendered
 * upstream and passed in as nodes — this client wrapper only owns tab
 * selection. Tabs with no content (e.g. an empty notes field) are omitted by
 * the page so the strip never shows a dead tab.
 */

import {
  CrossEntityTabs,
  type CrossEntityTab,
} from '@/components/agentic-os/_shared/views';

export interface CbtLogDetailTabsProps {
  /** Mood-before/after snapshot panel. Omit when the log has no mood data. */
  moodPanel?: React.ReactNode;
  /** The kind-specific exercise detail panel (always present). */
  detailPanel: React.ReactNode;
  /** Free-text notes panel. Omit when the log has no notes. */
  notesPanel?: React.ReactNode;
}

export function CbtLogDetailTabs({
  moodPanel,
  detailPanel,
  notesPanel,
}: CbtLogDetailTabsProps) {
  const tabs: CrossEntityTab[] = [
    { key: 'detail', label: 'Exercise', content: () => detailPanel },
  ];
  if (moodPanel) {
    tabs.unshift({ key: 'mood', label: 'Mood', content: () => moodPanel });
  }
  if (notesPanel) {
    tabs.push({ key: 'notes', label: 'Notes', content: () => notesPanel });
  }

  return <CrossEntityTabs slug="health" tabs={tabs} defaultTab="detail" />;
}
