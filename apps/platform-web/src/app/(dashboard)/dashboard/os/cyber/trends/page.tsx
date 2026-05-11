/**
 * CyberSec OS — Trends dashboard page.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, LineChart } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { getCyberTrendsData } from '@/lib/agentic-os/cyber/repo';
import { TrendsDashboard } from '@/components/agentic-os/cyber/trends/TrendsDashboard';

export const dynamic = 'force-dynamic';

export default async function CyberTrendsPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');
  const trends = await getCyberTrendsData({ ownerId: user.userId });
  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/os/cyber"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to CyberSec OS
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <LineChart className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Trends</h1>
      </div>
      <TrendsDashboard trends={trends} />
    </div>
  );
}
