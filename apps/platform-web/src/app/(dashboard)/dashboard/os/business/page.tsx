/**
 * Business OS — hub page.
 *
 * Server component. Wave E-2 (UI Depth Wave coherence pass): the bespoke
 * `BusinessHub` client component — hand-rolled header, back-link, and stat
 * card grid that pre-dated the primitive-aware `DashboardHub` — is retired.
 * The hub now renders through the shared `DashboardHub` shell like the rest
 * of the suite:
 *   - `module`          — drives the icon / name / status badge / tagline /
 *                         description header and the registry feature grid
 *                         (Deals, People, Organizations, Recent activity,
 *                         Projects, Time, Settings, Quotes, Invoices,
 *                         Expenses, P&L, Templates, Documents, AI Coach).
 *   - `dashboard`       — the Deals / People / Organizations stat trio plus
 *                         the recent-interaction activity feed, built by the
 *                         pure `buildBusinessDashboardSpec` adapter.
 *   - `roadmapMarkdown` — the Business execution plan in the collapsed
 *                         accordion.
 *
 * Same data, same routes, same counts — presentation layer only. The
 * Settings deep-link the bespoke header carried is preserved as the
 * `Settings` entry in the registry feature grid.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { loadAgenticOsPlan } from '@/lib/agentic-os/plan-loader';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
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
import { buildBusinessDashboardSpec } from '@/lib/agentic-os/business/dashboard-spec';

export const dynamic = 'force-dynamic';

const BUSINESS_SLUG = 'business';

export default async function BusinessHubPage() {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(BUSINESS_SLUG);
  if (!mod) {
    // Defensive — registry must contain Business while this page is shipped.
    throw new Error('Business OS module missing from registry');
  }

  const [
    plan,
    peopleCount,
    orgsCount,
    recentInteractions,
    people,
    organizations,
    openDeals,
  ] = await Promise.all([
    loadAgenticOsPlan(BUSINESS_SLUG),
    countActivePeople(user.userId),
    countActiveOrganizations(user.userId),
    listInteractions(user.userId, { limit: 10 }),
    listPeople(user.userId, { archived: false, limit: 500 }),
    listOrganizations(user.userId, { archived: false, limit: 500 }),
    listDeals(user.userId, { open: true }),
  ]);

  const pipeline = computePipelineForecast(openDeals);

  const dashboard = buildBusinessDashboardSpec({
    peopleCount,
    orgsCount,
    recentInteractions,
    recentPeople: people.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
    })),
    recentOrgs: organizations.map((o) => ({ id: o.id, name: o.name })),
    dealsCount: pipeline.dealCount,
    pipelineValueCents: pipeline.totalValueCents,
    pipelineWeightedCents: pipeline.totalWeightedValueCents,
  });

  return (
    <DashboardHub module={mod} roadmapMarkdown={plan ?? null} dashboard={dashboard} />
  );
}
