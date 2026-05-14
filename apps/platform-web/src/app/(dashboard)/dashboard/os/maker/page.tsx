/**
 * Maker OS — dashboard hub.
 *
 * Server component. Wave C-3a: the hub's "at a glance" surface is now wired
 * through `DashboardHub`'s declarative `dashboard` prop (v0.1.61) instead of
 * the bolted-on `flagBanner` strip that held the `RecentActivityWidget` +
 * `BlockersWidget` client components:
 *   - `widgets`  — aggregate workshop stats (active projects + avg progress,
 *                  workshop tools + down count, recent build activity, open
 *                  blockers with severity-escalated variant)
 *   - `chart`    — trailing-14-day build-log activity bar chart
 *   - `activity` — recent build-log feed across every project
 *
 * The data-shape adapter lives in `lib/agentic-os/maker/dashboard-spec.tsx`
 * (mirrors the Cyber sub-wave-2 pattern). The hub fetches the repo payloads
 * server-side; the spec is pure. The legacy `RecentActivityWidget` /
 * `BlockersWidget` client components are now unused — left in place for the
 * Wave D Maker specialization pass rather than deleted mid-adoption.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { loadAgenticOsPlan } from '@/lib/agentic-os/plan-loader';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listProjects,
  listTools,
  listRecentLogEntries,
  listTopBlockers,
} from '@/lib/agentic-os/maker/repo';
import { buildMakerDashboardSpec } from '@/lib/agentic-os/maker/dashboard-spec';

export const dynamic = 'force-dynamic';

const MAKER_SLUG = 'maker';

export default async function MakerOsPage() {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(MAKER_SLUG);
  if (!mod) {
    throw new Error('Maker OS module missing from registry');
  }

  const [plan, projects, tools, recentLogEntries, blockers] = await Promise.all([
    loadAgenticOsPlan(MAKER_SLUG),
    listProjects(user.userId),
    listTools({ userId: user.userId }),
    listRecentLogEntries(user.userId, 25),
    listTopBlockers(user.userId, { limit: 100 }),
  ]);

  const dashboard = buildMakerDashboardSpec({
    projects,
    tools,
    recentLogEntries,
    blockers,
  });

  return (
    <DashboardHub
      module={mod}
      roadmapMarkdown={plan ?? null}
      dashboard={dashboard}
    />
  );
}
