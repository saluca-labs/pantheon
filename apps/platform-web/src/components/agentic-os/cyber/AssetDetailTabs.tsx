'use client';

/**
 * CyberSec OS — Asset detail related-entity tabs (Wave C-2a, UI Depth Wave).
 *
 * Client wrapper that surfaces an asset's linked entities through the shared
 * `CrossEntityTabs` primitive: an `ActivityFeed` of alerts on the asset, and
 * a Groups panel. Replaces the two stacked ad-hoc `<section>`s on the asset
 * detail page — same data, same routes, just the primitive presentation.
 *
 * The asset detail page is a server component; this is the minimal
 * client island it needs because `CrossEntityTabs` owns tab state.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import type { Alert, AlertSeverity } from '@/lib/agentic-os/cyber/triage';
import type { AssetGroup } from '@/lib/agentic-os/cyber/repo';
import {
  ActivityFeed,
  CrossEntityTabs,
  EmptyState,
  type ActivityEvent,
  type ActivityTone,
} from '@/components/agentic-os/_shared/views';

const SEVERITY_TONE: Record<AlertSeverity, ActivityTone> = {
  critical: 'danger',
  high: 'attention',
  medium: 'warning',
  low: 'accent',
  info: 'neutral',
};

export interface AssetDetailTabsProps {
  alertsOnAsset: Alert[];
  groups: AssetGroup[];
}

export function AssetDetailTabs({ alertsOnAsset, groups }: AssetDetailTabsProps) {
  const alertEvents: ActivityEvent[] = alertsOnAsset.map((a) => ({
    id: a.id,
    occurredAt: a.occurredAt,
    actor: a.severity.toUpperCase(),
    summary: a.title,
    tone: SEVERITY_TONE[a.severity] ?? 'neutral',
    href: '/dashboard/os/cyber/alerts',
  }));

  return (
    <CrossEntityTabs
      slug="cyber"
      defaultTab="alerts"
      tabs={[
        {
          key: 'alerts',
          label: 'Alerts',
          count: alertsOnAsset.length,
          content: () => (
            <div className="rounded-xl border border-border-subtle bg-surface-2 p-2">
              <ActivityFeed
                events={alertEvents}
                grouping="day"
                emptyState={{
                  icon: <ShieldAlert className="h-6 w-6" />,
                  title: 'No alerts on this asset',
                  description:
                    'Alerts linked to this asset will appear here as they come in.',
                }}
              />
            </div>
          ),
        },
        {
          key: 'groups',
          label: 'Groups',
          count: groups.length,
          content: () =>
            groups.length === 0 ? (
              <EmptyState
                title="No asset groups yet"
                description="Create a group to bundle this asset with related ones."
                primaryCta={{
                  label: 'Manage groups',
                  href: '/dashboard/os/cyber/asset-groups',
                }}
              />
            ) : (
              <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
                <p className="text-sm text-text-secondary">
                  Add this asset to a group on the{' '}
                  <Link
                    href="/dashboard/os/cyber/asset-groups"
                    className="text-accent hover:underline"
                  >
                    groups page
                  </Link>
                  .
                </p>
              </div>
            ),
        },
      ]}
    />
  );
}
