/**
 * Business OS — hub dashboard-spec adapter (Wave E-2, UI Depth Wave).
 *
 * Pure data-shape adapter: turns the Business repo payloads (people / org
 * counts, recent `Interaction[]`, open-deal pipeline forecast) into the
 * declarative `DashboardSpec` consumed by `_shared/DashboardHub`'s
 * `dashboard` prop. No DB access, no React component state — the hub server
 * component fetches the data and calls this to assemble the spec.
 *
 * Wave E-2 convergence: the bespoke `BusinessHub` client component
 * (hand-rolled header / back-link / card grid) is retired. Its three stat
 * tiles (Deals / People / Organizations) become the declarative `widgets`
 * grid and the recent-interaction feed becomes the declarative `activity`
 * region — same data, same routes, same counts, same empty state — now
 * rendered through the shared hub shell like the rest of the suite.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

import { Users, Building2, DollarSign } from 'lucide-react';
import type {
  DashboardSpec,
  DashboardWidgetSpec,
} from '@/components/agentic-os/_shared/dashboard-hub';
import type { ActivityEvent } from '@/components/agentic-os/_shared/views';
import type { Interaction, Person, Organization } from './crm';

/** `1234567` cents → `$12,346` (whole-dollar, thousands-separated). */
function fmtCents(cents: number): string {
  const usd = (cents / 100).toFixed(0);
  return `$${Number(usd).toLocaleString()}`;
}

/** Recent people, projected down to the fields the activity feed needs. */
export type RecentPerson = Pick<Person, 'id' | 'firstName' | 'lastName'>;
/** Recent orgs, projected down to the fields the activity feed needs. */
export type RecentOrg = Pick<Organization, 'id' | 'name'>;

/**
 * Build the recent-activity `ActivityFeed` events from the hub's recent
 * interactions. Mirrors the old `BusinessHub` activity widget exactly — the
 * latest ten interactions, newest first, each labelled with the contact or
 * organization it touched (em-dash when neither resolves).
 */
export function buildBusinessActivityEvents(args: {
  recentInteractions: Interaction[];
  recentPeople: RecentPerson[];
  recentOrgs: RecentOrg[];
}): ActivityEvent[] {
  const { recentInteractions, recentPeople, recentOrgs } = args;
  const personById = new Map(recentPeople.map((p) => [p.id, p]));
  const orgById = new Map(recentOrgs.map((o) => [o.id, o]));

  return recentInteractions.slice(0, 10).map((i) => {
    const who = i.personId ? personById.get(i.personId) : null;
    const org = i.organizationId ? orgById.get(i.organizationId) : null;
    const label = who ? `${who.firstName} ${who.lastName}` : org ? org.name : '—';
    return {
      id: i.id,
      occurredAt: i.occurredAt,
      actor: label,
      summary: i.summary,
      tone: 'accent' as const,
    };
  });
}

/**
 * Assemble the full `DashboardSpec` for the Business OS hub.
 *
 * - `widgets`: the Deals / People / Organizations stat trio — each tile
 *   keeps its count, its supporting copy (incl. the open-deal pipeline /
 *   weighted-pipeline summary), and its drill-in `href`, exactly as the
 *   bespoke hub rendered them.
 * - `activity`: the recent-interaction feed with the same "No activity yet"
 *   empty state. The bespoke hub wrapped this feed in a full-width
 *   `DashboardWidget`; the shared hub renders the feed directly under the
 *   "Dashboard" section, so that one layer of duplicated widget chrome is
 *   the only thing dropped.
 */
export function buildBusinessDashboardSpec(args: {
  peopleCount: number;
  orgsCount: number;
  recentInteractions: Interaction[];
  recentPeople?: RecentPerson[];
  recentOrgs?: RecentOrg[];
  dealsCount: number;
  pipelineValueCents: number;
  pipelineWeightedCents: number;
}): DashboardSpec {
  const {
    peopleCount,
    orgsCount,
    recentInteractions,
    recentPeople = [],
    recentOrgs = [],
    dealsCount,
    pipelineValueCents,
    pipelineWeightedCents,
  } = args;

  const widgets: DashboardWidgetSpec[] = [
    {
      title: 'Deals',
      icon: <DollarSign className="h-4 w-4" />,
      href: '/dashboard/os/business/deals',
      'data-testid': 'business-hub-deals',
      children: (
        <>
          <p className="text-3xl font-semibold text-text-primary tabular-nums">
            {dealsCount}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Open deals
            {pipelineValueCents > 0 && (
              <span>
                {' '}&middot;{' '}
                <span className="tabular-nums">
                  {fmtCents(pipelineValueCents)}
                </span>{' '}
                pipeline
                {pipelineWeightedCents !== pipelineValueCents && (
                  <span>
                    {' '}(
                    <span className="tabular-nums">
                      {fmtCents(pipelineWeightedCents)}
                    </span>{' '}
                    weighted)
                  </span>
                )}
              </span>
            )}
            . Click to open kanban.
          </p>
        </>
      ),
    },
    {
      title: 'People',
      icon: <Users className="h-4 w-4" />,
      href: '/dashboard/os/business/people',
      'data-testid': 'business-hub-people',
      children: (
        <>
          <p className="text-3xl font-semibold text-text-primary tabular-nums">
            {peopleCount}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Active contacts. Click to browse.
          </p>
        </>
      ),
    },
    {
      title: 'Organizations',
      icon: <Building2 className="h-4 w-4" />,
      href: '/dashboard/os/business/organizations',
      'data-testid': 'business-hub-organizations',
      children: (
        <>
          <p className="text-3xl font-semibold text-text-primary tabular-nums">
            {orgsCount}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Active companies + partners.
          </p>
        </>
      ),
    },
  ];

  return {
    widgets,
    activity: {
      events: buildBusinessActivityEvents({
        recentInteractions,
        recentPeople,
        recentOrgs,
      }),
      grouping: 'none',
      emptyState: {
        title: 'No activity yet',
        description:
          'Log an interaction with a contact or organization to start the feed.',
      },
    },
  };
}
