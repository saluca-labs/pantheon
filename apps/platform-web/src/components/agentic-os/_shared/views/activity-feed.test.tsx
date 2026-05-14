/**
 * Wave B.1 — ActivityFeed render + grouping + interaction tests.
 *
 * Covers: empty state (default + custom + suppressed), desc sort,
 * day-grouping with Today/Yesterday headings, `none` grouping, tone
 * dots vs icon markers, the generic event-shape + `renderItem` escape
 * hatch, clickable `href` rows, and the load-more affordance.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { GitCommit } from 'lucide-react';
import { ActivityFeed } from './activity-feed';
import type { ActivityEvent } from './activity-feed';

function isoDaysAgo(days: number, hour = 12): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const baseEvents: ActivityEvent[] = [
  {
    id: 'e1',
    occurredAt: isoDaysAgo(0, 9),
    actor: 'Alfred',
    summary: 'closed the Acme deal',
    tone: 'positive',
  },
  {
    id: 'e2',
    occurredAt: isoDaysAgo(0, 14),
    actor: 'Cristian',
    summary: 'added an interaction',
    tone: 'accent',
  },
  {
    id: 'e3',
    occurredAt: isoDaysAgo(1, 10),
    summary: 'invoice went overdue',
    tone: 'attention',
  },
];

describe('ActivityFeed — empty state', () => {
  it('renders a friendly default empty state for zero events', () => {
    render(<ActivityFeed events={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('honors a custom empty state config', () => {
    render(
      <ActivityFeed
        events={[]}
        emptyState={{ title: 'No interactions logged' }}
      />,
    );
    expect(screen.getByText('No interactions logged')).toBeInTheDocument();
  });

  it('renders nothing when emptyState is false', () => {
    const { container } = render(
      <ActivityFeed events={[]} emptyState={false} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('ActivityFeed — rendering + grouping', () => {
  it('renders every event row', () => {
    render(<ActivityFeed events={baseEvents} />);
    expect(screen.getByTestId('activity-event-e1')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-e2')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-e3')).toBeInTheDocument();
  });

  it('sorts events descending by occurredAt within a day group', () => {
    render(<ActivityFeed events={baseEvents} grouping="none" />);
    const feed = screen.getByTestId('activity-feed');
    const rows = within(feed)
      .getAllByTestId(/^activity-event-e\d+$/)
      .map((el) => el.getAttribute('data-testid'));
    // e2 (today 14:00) before e1 (today 09:00) before e3 (yesterday).
    expect(rows).toEqual([
      'activity-event-e2',
      'activity-event-e1',
      'activity-event-e3',
    ]);
  });

  it('groups by day with Today / Yesterday headings', () => {
    render(<ActivityFeed events={baseEvents} grouping="day" />);
    const headings = screen
      .getAllByTestId(/^activity-group-heading-/)
      .map((el) => el.textContent);
    expect(headings[0]).toBe('Today');
    expect(headings[1]).toBe('Yesterday');
  });

  it('renders a flat list with no headings when grouping is none', () => {
    render(<ActivityFeed events={baseEvents} grouping="none" />);
    expect(screen.queryByTestId(/^activity-group-heading-/)).toBeNull();
  });

  it('renders a tone dot by default and an icon marker when icon is supplied', () => {
    render(
      <ActivityFeed
        grouping="none"
        events={[
          { id: 'd', occurredAt: isoDaysAgo(0), summary: 'dot row' },
          {
            id: 'i',
            occurredAt: isoDaysAgo(0),
            summary: 'icon row',
            icon: <GitCommit />,
          },
        ]}
      />,
    );
    expect(screen.getByTestId('activity-event-icon')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-dot')).toBeInTheDocument();
  });

  it('renders the actor + summary in the default row layout', () => {
    render(<ActivityFeed events={[baseEvents[0]!]} />);
    expect(screen.getByText('Alfred')).toBeInTheDocument();
    expect(screen.getByText('closed the Acme deal')).toBeInTheDocument();
  });
});

describe('ActivityFeed — generic events + renderItem', () => {
  interface DealEvent extends ActivityEvent {
    dealValue: number;
  }

  it('is generic over the event shape and passes typed events to renderItem', () => {
    const events: DealEvent[] = [
      {
        id: 'de1',
        occurredAt: isoDaysAgo(0),
        dealValue: 9000,
      },
    ];
    render(
      <ActivityFeed<DealEvent>
        events={events}
        renderItem={(ev) => (
          <div data-testid="custom-row">deal worth ${ev.dealValue}</div>
        )}
      />,
    );
    expect(screen.getByTestId('custom-row')).toHaveTextContent(
      'deal worth $9000',
    );
  });
});

describe('ActivityFeed — interactions', () => {
  it('renders href rows as anchors', () => {
    render(
      <ActivityFeed
        events={[
          {
            id: 'lnk',
            occurredAt: isoDaysAgo(0),
            summary: 'linked event',
            href: '/dashboard/os/business/deals/acme',
          },
        ]}
      />,
    );
    const row = screen.getByTestId('activity-event-lnk');
    expect(row.tagName).toBe('A');
    expect(row).toHaveAttribute(
      'href',
      '/dashboard/os/business/deals/acme',
    );
  });

  it('renders and fires the load-more button', () => {
    const onLoadMore = vi.fn();
    render(<ActivityFeed events={baseEvents} onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByTestId('activity-feed-load-more'));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('disables the load-more button while loadingMore', () => {
    render(
      <ActivityFeed
        events={baseEvents}
        onLoadMore={() => {}}
        loadingMore
      />,
    );
    const btn = screen.getByTestId('activity-feed-load-more');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Loading');
  });

  it('omits the load-more button when no handler is supplied', () => {
    render(<ActivityFeed events={baseEvents} />);
    expect(screen.queryByTestId('activity-feed-load-more')).toBeNull();
  });
});

describe('ActivityFeed — root data-testid passthrough', () => {
  it('defaults the root test id to "activity-feed"', () => {
    render(<ActivityFeed events={baseEvents} />);
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
  });

  it('applies a custom data-testid to the feed root element', () => {
    render(
      <ActivityFeed events={baseEvents} data-testid="deal-activity-feed" />,
    );
    const root = screen.getByTestId('deal-activity-feed');
    expect(root).toBeInTheDocument();
    // the override replaces the default — no stale "activity-feed" root
    expect(screen.queryByTestId('activity-feed')).toBeNull();
    // event rows still render inside the renamed root
    expect(within(root).getByTestId('activity-event-e1')).toBeInTheDocument();
  });
});
