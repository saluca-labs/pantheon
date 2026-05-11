/**
 * Maker OS — Workshop blockers page.
 *
 * Full list of cross-project blockers, grouped by project. Filter chips for
 * kind (milestone / dependency) and severity. The hub widget defers here
 * via "View all". Hydrates server-side with the full top-100 feed for
 * instant first paint, then refreshes client-side.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listTopBlockers } from '@/lib/agentic-os/maker/repo';
import { BlockersList } from '@/components/agentic-os/maker/blockers-list';

export const dynamic = 'force-dynamic';

export default async function MakerBlockersPage() {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const items = await listTopBlockers(user.userId, { limit: 100 });

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/maker"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Maker
      </Link>

      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 mb-6">
        <h1 className="text-xl font-semibold text-white inline-flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" />
          Workshop blockers
        </h1>
        <p className="text-sm text-[#94a3b8] mt-1 max-w-prose">
          Every active blocker across your Maker projects in one place — milestones
          that are missed, blocked, overdue, or at risk in the next 7 days, plus
          open <code className="text-[#cbd5e1]">blocks</code> dependency edges.
        </p>
      </div>

      <BlockersList initial={items} />
    </div>
  );
}
