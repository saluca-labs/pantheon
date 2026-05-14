/**
 * Business OS — hub page.
 *
 * Phase 1 introduces the new three-card hub (People / Organizations /
 * Recent activity).  Phase 2-7 cards will land as those phases ship.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { Briefcase, Settings as SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import {
  countActiveOrganizations,
  countActivePeople,
} from '@/lib/agentic-os/business/people-repo';
import { listInteractions } from '@/lib/agentic-os/business/interactions-repo';
import { listPeople } from '@/lib/agentic-os/business/people-repo';
import { listOrganizations } from '@/lib/agentic-os/business/orgs-repo';
import { listDeals } from '@/lib/agentic-os/business/deals-repo';
import { computePipelineForecast } from '@/lib/agentic-os/business/deals';
import { BusinessHub } from '@/components/agentic-os/business/business-hub';

export const dynamic = 'force-dynamic';

export default async function BusinessHubPage() {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const [
    peopleCount,
    orgsCount,
    recentInteractions,
    people,
    organizations,
    openDeals,
  ] = await Promise.all([
    countActivePeople(user.userId),
    countActiveOrganizations(user.userId),
    listInteractions(user.userId, { limit: 10 }),
    listPeople(user.userId, { archived: false, limit: 500 }),
    listOrganizations(user.userId, { archived: false, limit: 500 }),
    listDeals(user.userId, { open: true }),
  ]);

  const pipeline = computePipelineForecast(openDeals);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-3">
          <Briefcase className="w-6 h-6 text-teal-300" />
          <h1 className="text-2xl font-semibold text-white">Business OS</h1>
        </div>
        <Link
          href="/dashboard/os/business/settings"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
        >
          <SettingsIcon className="w-4 h-4" />
          Settings
        </Link>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        Solo to enterprise without re-architecting. Phase 2 adds the sales
        pipeline with deal tracking, kanban board, and pipeline forecasting.
      </p>

      <BusinessHub
        peopleCount={peopleCount}
        orgsCount={orgsCount}
        recentInteractions={recentInteractions}
        recentPeople={people.map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
        }))}
        recentOrgs={organizations.map((o) => ({ id: o.id, name: o.name }))}
        dealsCount={pipeline.dealCount}
        pipelineValueCents={pipeline.totalValueCents}
        pipelineWeightedCents={pipeline.totalWeightedValueCents}
      />
    </div>
  );
}
