/**
 * Business OS — Wave C (UI Depth Wave) primitive-adoption render tests.
 *
 * Business had no component-level render tests before Wave C; the prior
 * suite is all logic / repo / route coverage. These tests lock the
 * presentation-layer swap to the shared `_shared/views` primitives:
 *  - Business hub       → DashboardWidget + ActivityFeed + EmptyState
 *  - InteractionTimeline → ActivityFeed (+ EmptyState for the empty case)
 *  - DealKanban         → KanbanBoard
 *
 * They assert the primitive structure renders AND that the same domain
 * data still surfaces (counts, summaries, deal titles, stage columns),
 * so the "behavior-preserving" contract is verifiable.
 *
 * Wave E-2 (coherence pass) retired the bespoke `BusinessHub` client
 * component for the shared `DashboardHub` shell driven by the pure
 * `buildBusinessDashboardSpec` adapter. The hub tests below now exercise
 * that spec rendered through `DashboardHub` — same widgets, same counts,
 * same routes, same empty state, just the shared shell.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { buildBusinessDashboardSpec } from '@/lib/agentic-os/business/dashboard-spec';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import type { AgenticOsModule } from '@/lib/agentic-os/registry';
import { InteractionTimeline } from '@/components/agentic-os/business/interaction-timeline';
import DealKanban from '@/components/agentic-os/business/deal-kanban';
import type { Interaction } from '@/lib/agentic-os/business/crm';
import type { Deal } from '@/lib/agentic-os/business/deals';

const businessModule = findAgenticOsModule('business') as AgenticOsModule;

/** Render the Business hub the way the page does — spec → DashboardHub. */
function renderBusinessHub(
  args: Parameters<typeof buildBusinessDashboardSpec>[0],
) {
  return render(
    <DashboardHub
      module={businessModule}
      roadmapMarkdown={null}
      dashboard={buildBusinessDashboardSpec(args)}
    />,
  );
}

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

describe('Business hub — DashboardHub convergence', () => {
  it('renders the three stat DashboardWidget tiles through the shared hub', () => {
    renderBusinessHub({
      peopleCount: 12,
      orgsCount: 4,
      recentInteractions: [
        mkInteraction({ id: 'int-1', summary: 'Logged a note' }),
      ],
      dealsCount: 7,
      pipelineValueCents: 0,
      pipelineWeightedCents: 0,
    });
    expect(screen.getByTestId('business-hub-deals')).toBeInTheDocument();
    expect(screen.getByTestId('business-hub-people')).toBeInTheDocument();
    expect(screen.getByTestId('business-hub-organizations')).toBeInTheDocument();
    // Recent activity now renders as the hub's declarative activity feed
    // (no longer wrapped in its own full-width DashboardWidget).
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    // All four surfaces sit inside the shared hub's dashboard region.
    expect(
      screen.getByTestId('dashboard-hub-region'),
    ).toBeInTheDocument();
  });

  it('renders the stat trio inside the shared dashboard region', () => {
    renderBusinessHub({
      peopleCount: 1,
      orgsCount: 1,
      recentInteractions: [],
      dealsCount: 1,
      pipelineValueCents: 0,
      pipelineWeightedCents: 0,
    });
    const grid = screen.getByTestId('dashboard-hub-widget-grid');
    expect(grid).toContainElement(screen.getByTestId('business-hub-deals'));
    expect(grid).toContainElement(screen.getByTestId('business-hub-people'));
    expect(grid).toContainElement(
      screen.getByTestId('business-hub-organizations'),
    );
  });

  it('preserves the domain counts inside the widgets', () => {
    renderBusinessHub({
      peopleCount: 12,
      orgsCount: 4,
      recentInteractions: [],
      dealsCount: 7,
      pipelineValueCents: 0,
      pipelineWeightedCents: 0,
    });
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('widget tiles link to the same routes as before', () => {
    renderBusinessHub({
      peopleCount: 1,
      orgsCount: 1,
      recentInteractions: [],
      dealsCount: 1,
      pipelineValueCents: 0,
      pipelineWeightedCents: 0,
    });
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
    renderBusinessHub({
      peopleCount: 0,
      orgsCount: 0,
      recentInteractions: [],
      dealsCount: 0,
      pipelineValueCents: 0,
      pipelineWeightedCents: 0,
    });
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });

  it('renders recent interactions through the ActivityFeed', () => {
    renderBusinessHub({
      peopleCount: 0,
      orgsCount: 0,
      recentInteractions: [
        mkInteraction({ id: 'int-9', summary: 'Discovery call with Jane' }),
      ],
      recentPeople: [],
      recentOrgs: [],
      dealsCount: 0,
      pipelineValueCents: 0,
      pipelineWeightedCents: 0,
    });
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    expect(screen.getByText('Discovery call with Jane')).toBeInTheDocument();
  });

  it('labels an activity row with the contact it touched', () => {
    renderBusinessHub({
      peopleCount: 0,
      orgsCount: 0,
      recentInteractions: [
        mkInteraction({ id: 'int-7', personId: 'p-1', summary: 'Kickoff' }),
      ],
      recentPeople: [{ id: 'p-1', firstName: 'Jane', lastName: 'Roe' }],
      recentOrgs: [],
      dealsCount: 0,
      pipelineValueCents: 0,
      pipelineWeightedCents: 0,
    });
    expect(screen.getByText('Jane Roe')).toBeInTheDocument();
  });

  it('still shows the weighted-pipeline summary copy', () => {
    renderBusinessHub({
      peopleCount: 0,
      orgsCount: 0,
      recentInteractions: [],
      dealsCount: 3,
      pipelineValueCents: 1000000,
      pipelineWeightedCents: 400000,
    });
    expect(screen.getByTestId('business-hub-deals').textContent).toContain(
      'weighted',
    );
  });

  it('renders the shared hub header + registry feature grid', () => {
    renderBusinessHub({
      peopleCount: 0,
      orgsCount: 0,
      recentInteractions: [],
      dealsCount: 0,
      pipelineValueCents: 0,
      pipelineWeightedCents: 0,
    });
    // Header from the registry module — replaces the bespoke hand-rolled one.
    expect(
      screen.getByRole('heading', { name: 'Business OS' }),
    ).toBeInTheDocument();
    // The registry feature grid renders every Business feature, incl. the
    // Settings deep-link the bespoke header used to carry standalone.
    expect(
      screen.getByRole('link', { name: /All Agentic OS modules/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /^Settings/ }),
    ).toHaveAttribute('href', '/dashboard/os/business/settings');
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
