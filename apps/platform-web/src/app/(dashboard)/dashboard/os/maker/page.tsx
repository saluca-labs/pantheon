/**
 * Maker OS — dashboard hub.
 *
 * Mirrors the Health / Filmmaker / Cyber hubs: a `DashboardHub` shell driven
 * by the registry entry plus the markdown plan as a collapsed accordion.
 *
 * Phase 3 added the Recent activity widget that surfaces the latest
 * build-log entries across all of the user's Maker projects. Phase 6 adds
 * the Top Blockers widget side-by-side: workshop-wide milestones at risk +
 * open `blocks` dependency edges.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { loadAgenticOsPlan } from '@/lib/agentic-os/plan-loader';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { RecentActivityWidget } from '@/components/agentic-os/maker/recent-activity-widget';
import { BlockersWidget } from '@/components/agentic-os/maker/blockers-widget';
import { listTopBlockers } from '@/lib/agentic-os/maker/repo';

export const dynamic = 'force-dynamic';

const MAKER_SLUG = 'maker';

export default async function MakerOsPage() {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(MAKER_SLUG);
  if (!mod) {
    throw new Error('Maker OS module missing from registry');
  }

  const plan = await loadAgenticOsPlan(MAKER_SLUG);
  const initialBlockers = await listTopBlockers(user.userId, { limit: 5 });

  return (
    <DashboardHub
      module={mod}
      roadmapMarkdown={plan ?? null}
      flagBanner={
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RecentActivityWidget />
          <BlockersWidget initial={initialBlockers} />
        </div>
      }
    />
  );
}
