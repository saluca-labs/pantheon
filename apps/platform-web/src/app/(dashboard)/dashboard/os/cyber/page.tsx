/**
 * CyberSec OS — Hub page.
 *
 * Server component. Wave C-2a: the hub's "at a glance" surface is now wired
 * through `DashboardHub`'s declarative `dashboard` prop (v0.1.61) instead of
 * a bolted-on sibling strip:
 *   - `widgets`  — aggregate SecOps stats (open / critical alerts, assets,
 *                  open exposures + MTTR, IOC hits, active log sources)
 *   - `chart`    — 30-day alert volume bar chart
 *   - `activity` — recent active alerts feed
 *
 * The recent-assets panel stays as a sibling section — it is not aggregate
 * "at a glance" state and has no matching declarative slot.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getCyberDashboardStats,
  getCyberTrendsData,
  listAlerts,
  listAssets,
} from '@/lib/agentic-os/cyber/repo';
import { sortAlerts, activeAlerts } from '@/lib/agentic-os/cyber/triage';
import { buildCyberDashboardSpec } from '@/lib/agentic-os/cyber/dashboard-spec';
import { AssetCard } from '@/components/agentic-os/cyber/AssetCard';
import { EmptyState } from '@/components/agentic-os/_shared/views';

export const dynamic = 'force-dynamic';

const CYBER_SLUG = 'cyber';

export default async function CyberOsHubPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(CYBER_SLUG);
  if (!mod) throw new Error('Cyber OS module missing from registry');

  const [stats, trends, alerts, assets] = await Promise.all([
    getCyberDashboardStats(user.userId),
    getCyberTrendsData({ ownerId: user.userId }),
    listAlerts(user.userId, 50),
    listAssets({ ownerId: user.userId, limit: 20 }),
  ]);

  const recentAlerts = activeAlerts(sortAlerts(alerts)).slice(0, 6);
  const recentAssets = assets.slice(0, 5);

  const dashboard = buildCyberDashboardSpec({ stats, trends, recentAlerts });

  return (
    <div className="space-y-6">
      <DashboardHub
        module={mod}
        dashboard={dashboard}
      />

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5 max-w-5xl">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Recent assets</h2>
          <Link
            href="/dashboard/os/cyber/assets"
            className="text-xs text-text-secondary hover:text-white transition"
          >
            View all →
          </Link>
        </div>
        {recentAssets.length === 0 ? (
          <EmptyState
            variant="bare"
            title="No assets yet"
            description="Add hosts, containers, and accounts so alerts have something to link to."
            primaryCta={{
              label: 'Add an asset',
              href: '/dashboard/os/cyber/assets',
            }}
          />
        ) : (
          <div className="space-y-2">
            {recentAssets.map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
