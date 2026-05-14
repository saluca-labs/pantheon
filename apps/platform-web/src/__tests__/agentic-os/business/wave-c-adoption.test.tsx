/**
 * Business OS — Wave C (UI Depth Wave) primitive-adoption render tests.
 *
 * Business had no component-level render tests before Wave C; the prior
 * suite is all logic / repo / route coverage. These tests lock the
 * presentation-layer swap to the shared `_shared/views` primitives:
 *  - BusinessHub        → DashboardWidget + ActivityFeed + EmptyState
 *  - InteractionTimeline → ActivityFeed (+ EmptyState for the empty case)
 *  - DealKanban         → KanbanBoard
 *
 * They assert the primitive structure renders AND that the same domain
 * data still surfaces (counts, summaries, deal titles, stage columns),
 * so the "behavior-preserving" contract is verifiable.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BusinessHub } from '@/components/agentic-os/business/business-hub';
import { InteractionTimeline } from '@/components/agentic-os/business/interaction-timeline';
import DealKanban from '@/components/agentic-os/business/deal-kanban';
import type { Interaction } from '@/lib/agentic-os/business/crm';
import type { Deal } from '@/lib/agentic-os/business/deals';

function mkInteraction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    id: 'int-1',
    userId: 'u-1',
    personId: null,
    organizationId: null,
    dealId: null,
    interactionType: 'note',
    summary: 'Logged a note',
    occurredAt: '2026-05-12T10:00:00.000Z',
    createdAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

function mkDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'deal-1',
    userId: 'u-1',
    contactId: null,
    organizationId: null,
    title: 'Acme renewal',
    descriptionMd: '',
    stage: 'lead',
    valueCents: 500000,
    currency: 'USD',
    probabilityPct: 40,
    expectedCloseDate: null,
    closedAt: null,
    lostReason: null,
    source: null,
    tags: [],
    metadata: {},
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('BusinessHub — DashboardWidget adoption', () => {
  it('renders three DashboardWidget tiles + the activity widget', () => {
    render(
      <BusinessHub
        peopleCount={12}
        orgsCount={4}
        recentInteractions={[]}
        dealsCount={7}
        pipelineValueCents={0}
        pipelineWeightedCents={0}
      />,
    );
    expect(screen.getByTestId('business-hub-deals')).toBeInTheDocument();
    expect(screen.getByTestId('business-hub-people')).toBeInTheDocument();
    expect(screen.getByTestId('business-hub-organizations')).toBeInTheDocument();
    expect(screen.getByTestId('business-hub-activity')).toBeInTheDocument();
  });

  it('preserves the domain counts inside the widgets', () => {
    render(
      <BusinessHub
        peopleCount={12}
        orgsCount={4}
        recentInteractions={[]}
        dealsCount={7}
        pipelineValueCents={0}
        pipelineWeightedCents={0}
      />,
    );
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('widget tiles link to the same routes as before', () => {
    render(
      <BusinessHub
        peopleCount={1}
        orgsCount={1}
        recentInteractions={[]}
        dealsCount={1}
        pipelineValueCents={0}
        pipelineWeightedCents={0}
      />,
    );
    expect(screen.getByTestId('business-hub-deals')).toHaveAttribute(
      'href',
      '/dashboard/os/business/deals',
    );
    expect(screen.getByTestId('business-hub-people')).toHaveAttribute(
      'href',
      '/dashboard/os/business/people',
    );
    expect(screen.getByTestId('business-hub-organizations')).toHaveAttribute(
      'href',
      '/dashboard/os/business/organizations',
    );
  });

  it('renders the ActivityFeed empty state when there is no activity', () => {
    render(
      <BusinessHub
        peopleCount={0}
        orgsCount={0}
        recentInteractions={[]}
        dealsCount={0}
        pipelineValueCents={0}
        pipelineWeightedCents={0}
      />,
    );
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });

  it('renders recent interactions through the ActivityFeed', () => {
    render(
      <BusinessHub
        peopleCount={0}
        orgsCount={0}
        recentInteractions={[
          mkInteraction({ id: 'int-9', summary: 'Discovery call with Jane' }),
        ]}
        recentPeople={[]}
        recentOrgs={[]}
        dealsCount={0}
        pipelineValueCents={0}
        pipelineWeightedCents={0}
      />,
    );
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    expect(screen.getByText('Discovery call with Jane')).toBeInTheDocument();
  });

  it('still shows the weighted-pipeline summary copy', () => {
    render(
      <BusinessHub
        peopleCount={0}
        orgsCount={0}
        recentInteractions={[]}
        dealsCount={3}
        pipelineValueCents={1000000}
        pipelineWeightedCents={400000}
      />,
    );
    expect(screen.getByTestId('business-hub-deals').textContent).toContain('weighted');
  });
});

describe('InteractionTimeline — ActivityFeed adoption', () => {
  it('renders the ActivityFeed empty state when there are no interactions', () => {
    render(<InteractionTimeline interactions={[]} />);
    expect(screen.getByText('No interactions logged yet')).toBeInTheDocument();
  });

  it('renders one ActivityFeed event row per interaction', () => {
    render(
      <InteractionTimeline
        interactions={[
          mkInteraction({ id: 'a', summary: 'Sent the proposal' }),
          mkInteraction({ id: 'b', summary: 'Booked a follow-up' }),
        ]}
      />,
    );
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-a')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-b')).toBeInTheDocument();
    expect(screen.getByText('Sent the proposal')).toBeInTheDocument();
    expect(screen.getByText('Booked a follow-up')).toBeInTheDocument();
  });

  it('keeps the interaction-type pill in the render-prop row', () => {
    render(
      <InteractionTimeline
        interactions={[mkInteraction({ interactionType: 'call' })]}
      />,
    );
    expect(screen.getByText('Call')).toBeInTheDocument();
  });
});

describe('DealKanban — KanbanBoard adoption', () => {
  it('renders the shared KanbanBoard in board mode', () => {
    render(<DealKanban deals={[mkDeal()]} contacts={[]} orgs={[]} />);
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
  });

  it('renders a column per open stage and places the deal card', () => {
    render(
      <DealKanban
        deals={[mkDeal({ id: 'd-1', title: 'Acme renewal', stage: 'lead' })]}
        contacts={[]}
        orgs={[]}
      />,
    );
    expect(screen.getByTestId('kanban-column-lead')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-column-qualified')).toBeInTheDocument();
    // Closed columns are hidden until "Show closed" is toggled.
    expect(screen.queryByTestId('kanban-column-won')).toBeNull();
    expect(screen.getByText('Acme renewal')).toBeInTheDocument();
  });

  it('still exposes the board / list view toggle', () => {
    render(<DealKanban deals={[mkDeal()]} contacts={[]} orgs={[]} />);
    expect(screen.getByText('Board')).toBeInTheDocument();
    expect(screen.getByText('List')).toBeInTheDocument();
    expect(screen.getByText('Show closed')).toBeInTheDocument();
  });
});
