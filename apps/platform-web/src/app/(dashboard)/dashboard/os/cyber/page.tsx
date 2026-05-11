/**
 * CyberSec OS — Hub page.
 *
 * Server component:
 *   - 4-stat row (open / critical alerts, total assets, active log sources)
 *   - Feature tiles via DashboardHub
 *   - Recent alerts panel (top 5 active, severity desc)
 *   - Recent assets panel (top 5 by criticality desc)
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { loadAgenticOsPlan } from '@/lib/agentic-os/plan-loader';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getCyberDashboardStats,
  listAlerts,
  listAssets,
} from '@/lib/agentic-os/cyber/repo';
import { sortAlerts, activeAlerts } from '@/lib/agentic-os/cyber/triage';
import { CyberDashboardStats } from '@/components/agentic-os/cyber/CyberDashboardStats';
import { AssetCard } from '@/components/agentic-os/cyber/AssetCard';

export const dynamic = 'force-dynamic';

const CYBER_SLUG = 'cyber';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'text-red-200 bg-red-600/20 border-red-500/50',
  high:     'text-orange-300 bg-orange-500/10 border-orange-500/30',
  medium:   'text-amber-300 bg-amber-500/10 border-amber-500/30',
  low:      'text-blue-300 bg-blue-500/10 border-blue-500/30',
  info:     'text-slate-300 bg-slate-500/10 border-slate-500/30',
};

export default async function CyberOsHubPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(CYBER_SLUG);
  if (!mod) throw new Error('Cyber OS module missing from registry');

  const [plan, stats, alerts, assets] = await Promise.all([
    loadAgenticOsPlan(CYBER_SLUG),
    getCyberDashboardStats(user.userId),
    listAlerts(user.userId, 50),
    listAssets({ ownerId: user.userId, limit: 20 }),
  ]);

  const recentAlerts = activeAlerts(sortAlerts(alerts)).slice(0, 5);
  const recentAssets = assets.slice(0, 5);

  return (
    <div className="space-y-6">
      <CyberDashboardStats stats={stats} />

      <DashboardHub module={mod} roadmapMarkdown={plan ?? null} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
        <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <ShieldAlert className="w-4 h-4 text-[#4361EE]" />
              Recent active alerts
            </h2>
            <Link
              href="/dashboard/os/cyber/alerts"
              className="text-xs text-[#94a3b8] hover:text-white transition"
            >
              View all →
            </Link>
          </div>
          {recentAlerts.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">No active alerts.</p>
          ) : (
            <ul className="space-y-2">
              {recentAlerts.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${
                      SEVERITY_BADGE[a.severity] ?? ''
                    }`}
                  >
                    {a.severity}
                  </span>
                  <span className="text-sm text-white truncate">{a.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-white">Recent assets</h2>
            <Link
              href="/dashboard/os/cyber/assets"
              className="text-xs text-[#94a3b8] hover:text-white transition"
            >
              View all →
            </Link>
          </div>
          {recentAssets.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">No assets yet — add one to start linking alerts.</p>
          ) : (
            <div className="space-y-2">
              {recentAssets.map((a) => (
                <AssetCard key={a.id} asset={a} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
