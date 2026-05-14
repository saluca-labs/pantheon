/**
 * ActivityFeed — the one true chronological event-list primitive.
 *
 * There are 6+ ad-hoc timeline/feed implementations across the OSes
 * today (`interaction-timeline.tsx`, `notebook-timeline.tsx`,
 * `recent-activity-widget.tsx`, `build-log-feed.tsx`, ...). This is the
 * primitive that retires them. Generic over event shape, group-by-day,
 * with a render-prop escape hatch for custom event rows.
 *
 * Wave B.1 primitive. Standalone — wired into OS pages in Wave C.
 *
 * Spec sources:
 *  - PANTHEON_UI_DEPTH_WAVE_PLAN.md §2.3
 *  - _design/visual-language.md (surface ladder, text hierarchy, status)
 *  - _design/tokens.md §3, §4
 */

import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { EmptyState } from './empty-state';
import type { EmptyStateProps } from './empty-state';

/** Status accent for an event dot — maps to the semantic status tokens. */
export type ActivityTone =
  | 'neutral'
  | 'accent'
  | 'positive'
  | 'warning'
  | 'attention'
  | 'danger';

/**
 * The minimal shape every activity event must satisfy. Callers extend
 * this with their own domain fields; `ActivityFeed` is generic over the
 * extension so `renderItem` receives the fully-typed event.
 */
export interface ActivityEvent {
  /** Stable key. */
  id: string;
  /** When the event occurred — ISO string or Date. Drives grouping + ordering. */
  occurredAt: string | Date;
  /** Short one-line summary. Ignored when a `renderItem` prop is supplied. */
  summary?: ReactNode;
  /** Optional actor label (who did it). */
  actor?: ReactNode;
  /** Optional leading icon (Lucide element). Overrides the tone dot. */
  icon?: ReactNode;
  /** Status tone for the leading dot. Default `neutral`. */
  tone?: ActivityTone;
  /** Optional link target — makes the row clickable. */
  href?: string;
}

export interface ActivityFeedProps<TEvent extends ActivityEvent = ActivityEvent> {
  /** Events to render. Need not be pre-sorted — the feed sorts desc by `occurredAt`. */
  events: TEvent[];
  /**
   * Grouping mode. `day` (default) inserts a sticky date heading per
   * calendar day; `none` renders a flat list.
   */
  grouping?: 'day' | 'none';
  /**
   * Custom row renderer. When supplied, replaces the default
   * actor/summary/timestamp layout — the tone dot + rail are still drawn.
   */
  renderItem?: (event: TEvent) => ReactNode;
  /**
   * Empty-state config. When omitted, a friendly plainspoken default is
   * shown. Pass `false` to render nothing when there are no events.
   */
  emptyState?: Partial<EmptyStateProps> | false;
  /**
   * When provided, a "Load more" button is rendered at the foot of the
   * feed and calls this handler.
   */
  onLoadMore?: () => void;
  /** Whether a load-more action is in flight (disables the button). */
  loadingMore?: boolean;
  /** Extra classes on the root element. */
  className?: string;
  /** Optional test id override applied to the feed's root element. */
  'data-testid'?: string;
}

const TONE_DOT: Record<ActivityTone, string> = {
  neutral: 'bg-text-tertiary',
  accent: 'bg-accent',
  positive: 'bg-positive',
  warning: 'bg-warning',
  attention: 'bg-attention',
  danger: 'bg-danger',
};

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Stable YYYY-MM-DD key in the viewer's local timezone. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Friendly day heading: "Today" / "Yesterday" / "May 11, 2026". */
function dayHeading(d: Date): string {
  const today = new Date();
  const todayKey = dayKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const key = dayKey(d);
  if (key === todayKey) return 'Today';
  if (key === dayKey(yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Short clock label for a single event: "3:42 PM". */
function timeLabel(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function EventRow<TEvent extends ActivityEvent>({
  event,
  renderItem,
}: {
  event: TEvent;
  renderItem?: (event: TEvent) => ReactNode;
}) {
  const tone = event.tone ?? 'neutral';
  const occurred = toDate(event.occurredAt);

  const body = renderItem ? (
    renderItem(event)
  ) : (
    <div className="min-w-0">
      <p className="text-sm text-text-primary">
        {event.actor ? (
          <span className="font-medium">{event.actor} </span>
        ) : null}
        <span className="text-text-secondary">{event.summary}</span>
      </p>
      <p className="mt-0.5 text-xs tabular-nums text-text-tertiary">
        {timeLabel(occurred)}
      </p>
    </div>
  );

  const marker = event.icon ? (
    <span
      className="flex h-5 w-5 items-center justify-center text-text-secondary"
      data-testid="activity-event-icon"
      aria-hidden="true"
    >
      {event.icon}
    </span>
  ) : (
    <span
      className={clsx(
        'mt-1.5 block h-2 w-2 rounded-full',
        TONE_DOT[tone],
      )}
      data-testid="activity-event-dot"
      aria-hidden="true"
    />
  );

  const rowInner = (
    <>
      <div className="flex w-5 shrink-0 justify-center">{marker}</div>
      {body}
    </>
  );

  if (event.href) {
    return (
      <a
        href={event.href}
        data-testid={`activity-event-${event.id}`}
        className="flex gap-3 rounded-lg px-2 py-2 transition hover:bg-surface-3"
      >
        {rowInner}
      </a>
    );
  }
  return (
    <div
      data-testid={`activity-event-${event.id}`}
      className="flex gap-3 px-2 py-2"
    >
      {rowInner}
    </div>
  );
}

export function ActivityFeed<TEvent extends ActivityEvent = ActivityEvent>({
  events,
  grouping = 'day',
  renderItem,
  emptyState,
  onLoadMore,
  loadingMore = false,
  className,
  'data-testid': testId = 'activity-feed',
}: ActivityFeedProps<TEvent>) {
  const sorted = [...events].sort(
    (a, b) => toDate(b.occurredAt).getTime() - toDate(a.occurredAt).getTime(),
  );

  if (sorted.length === 0) {
    if (emptyState === false) return null;
    return (
      <EmptyState
        variant="bare"
        title="Nothing here yet"
        description="Activity will show up here as things happen."
        {...emptyState}
      />
    );
  }

  // Build day groups preserving sorted order.
  const groups: { key: string; heading: string; events: TEvent[] }[] = [];
  if (grouping === 'day') {
    for (const ev of sorted) {
      const d = toDate(ev.occurredAt);
      const key = dayKey(d);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.events.push(ev);
      } else {
        groups.push({ key, heading: dayHeading(d), events: [ev] });
      }
    }
  } else {
    groups.push({ key: 'all', heading: '', events: sorted });
  }

  return (
    <div data-testid={testId} className={clsx('flex flex-col', className)}>
      {groups.map((group) => (
        <section key={group.key} data-testid={`activity-group-${group.key}`}>
          {grouping === 'day' ? (
            <h4
              className="sticky top-0 z-10 bg-surface-2/95 px-2 py-1.5 text-2xs font-medium uppercase tracking-wide text-text-tertiary backdrop-blur"
              data-testid={`activity-group-heading-${group.key}`}
            >
              {group.heading}
            </h4>
          ) : null}
          <div className="flex flex-col">
            {group.events.map((ev) => (
              <EventRow key={ev.id} event={ev} renderItem={renderItem} />
            ))}
          </div>
        </section>
      ))}

      {onLoadMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          data-testid="activity-feed-load-more"
          className="mt-2 self-center rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}
