'use client';

/**
 * Business OS hub landing.
 *
 * Wave C (UI Depth Wave) adoption: the ad-hoc card grid is replaced with
 * shared `DashboardWidget` containers, recent activity now renders through
 * the shared `ActivityFeed` primitive, and the zero-activity case uses the
 * shared `EmptyState`. Same data, same routes, same counts — presentation
 * layer only.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

import { Users, Building2, Activity, DollarSign } from 'lucide-react';
import type { Interaction, Person, Organization } from '@/lib/agentic-os/business/crm';
import {
  ActivityFeed,
  DashboardWidget,
  type ActivityEvent,
} from '@/components/agentic-os/_shared/views';

function fmtCents(cents: number): string {
  const usd = (cents / 100).toFixed(0);
  return `$${Number(usd).toLocaleString()}`;
}

interface Props {
  peopleCount: number;
  orgsCount: number;
  recentInteractions: Interaction[];
  recentPeople?: Pick<Person, 'id' | 'firstName' | 'lastName'>[];
  recentOrgs?: Pick<Organization, 'id' | 'name'>[];
  dealsCount: number;
  pipelineValueCents: number;
  pipelineWeightedCents: number;
}

export function BusinessHub({
  peopleCount,
  orgsCount,
  recentInteractions,
  recentPeople = [],
  recentOrgs = [],
  dealsCount,
  pipelineValueCents,
  pipelineWeightedCents,
}: Props) {
  const personById = new Map(recentPeople.map((p) => [p.id, p]));
  const orgById = new Map(recentOrgs.map((o) => [o.id, o]));

  const activityEvents: ActivityEvent[] = recentInteractions.slice(0, 10).map((i) => {
    const who = i.personId ? personById.get(i.personId) : null;
    const org = i.organizationId ? orgById.get(i.organizationId) : null;
    const label = who ? `${who.firstName} ${who.lastName}` : org ? org.name : '—';
    return {
      id: i.id,
      occurredAt: i.occurredAt,
      actor: label,
      summary: i.summary,
      tone: 'accent',
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <DashboardWidget
        title="Deals"
        icon={<DollarSign className="h-4 w-4" />}
        osSlug="business"
        href="/dashboard/os/business/deals"
        data-testid="business-hub-deals"
      >
        <p className="text-3xl font-semibold text-text-primary tabular-nums">
          {dealsCount}
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          Open deals
          {pipelineValueCents > 0 && (
            <span>
              {' '}&middot;{' '}
              <span className="tabular-nums">{fmtCents(pipelineValueCents)}</span> pipeline
              {pipelineWeightedCents !== pipelineValueCents && (
                <span>
                  {' '}(
                  <span className="tabular-nums">{fmtCents(pipelineWeightedCents)}</span>{' '}
                  weighted)
                </span>
              )}
            </span>
          )}
          . Click to open kanban.
        </p>
      </DashboardWidget>

      <DashboardWidget
        title="People"
        icon={<Users className="h-4 w-4" />}
        osSlug="business"
        href="/dashboard/os/business/people"
        data-testid="business-hub-people"
      >
        <p className="text-3xl font-semibold text-text-primary tabular-nums">
          {peopleCount}
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          Active contacts. Click to browse.
        </p>
      </DashboardWidget>

      <DashboardWidget
        title="Organizations"
        icon={<Building2 className="h-4 w-4" />}
        osSlug="business"
        href="/dashboard/os/business/organizations"
        data-testid="business-hub-organizations"
      >
        <p className="text-3xl font-semibold text-text-primary tabular-nums">
          {orgsCount}
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          Active companies + partners.
        </p>
      </DashboardWidget>

      <DashboardWidget
        title="Recent activity"
        icon={<Activity className="h-4 w-4" />}
        osSlug="business"
        className="lg:col-span-3"
        data-testid="business-hub-activity"
      >
        <ActivityFeed
          events={activityEvents}
          grouping="none"
          emptyState={{
            title: 'No activity yet',
            description:
              'Log an interaction with a contact or organization to start the feed.',
          }}
        />
      </DashboardWidget>
    </div>
  );
}
