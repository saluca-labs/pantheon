/**
 * CyberSec OS — Dashboard stats row.
 *
 * Server component — pure presentation. The hub page fetches the stats
 * payload from `getCyberDashboardStats` and hands it down.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { ShieldAlert, AlertTriangle, Server, Database } from 'lucide-react';
import { StatCard } from '@/components/agentic-os/_shared/stat-card';
import type { CyberDashboardStats as Stats } from '@/lib/agentic-os/cyber/repo';

export function CyberDashboardStats({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard
        label="Open alerts"
        value={stats.openAlerts}
        sublabel={`${stats.alertsLast24h} in the last 24h`}
        icon={<ShieldAlert className="w-4 h-4" />}
      />
      <StatCard
        label="Critical alerts"
        value={stats.criticalAlerts}
        sublabel={`${stats.alertsLast7d} in the last 7d`}
        icon={<AlertTriangle className="w-4 h-4" />}
      />
      <StatCard
        label="Total assets"
        value={stats.totalAssets}
        sublabel={`${stats.criticalAssets} critical`}
        icon={<Server className="w-4 h-4" />}
      />
      <StatCard
        label="Active log sources"
        value={stats.activeLogSources}
        icon={<Database className="w-4 h-4" />}
      />
    </div>
  );
}
