/**
 * Maker OS — dashboard hub.
 *
 * Mirrors the Health / Filmmaker / Cyber hubs: a `DashboardHub` shell driven
 * by the registry entry plus the markdown plan as a collapsed accordion.
 *
 * Phase 3 adds a Recent activity widget that surfaces the latest build-log
 * entries across all of the user's Maker projects. It rides the
 * `flagBanner` slot on the shared hub so we don't have to fork the shell
 * for a single OS-specific surface.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { loadAgenticOsPlan } from '@/lib/agentic-os/plan-loader';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { RecentActivityWidget } from '@/components/agentic-os/maker/recent-activity-widget';

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

  return (
    <DashboardHub
      module={mod}
      roadmapMarkdown={plan ?? null}
      flagBanner={<RecentActivityWidget />}
    />
  );
}
