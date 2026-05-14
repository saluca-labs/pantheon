/**
 * Agentic OS shared-view primitives — barrel (Wave B, UI Depth Wave).
 *
 * Re-exports all 11 shared-view primitives and their public prop / data
 * types so consumers can `import { KanbanBoard, EmptyState } from
 * '@/components/agentic-os/_shared/views'` instead of reaching into
 * individual files. Wave C wires these into the OS hubs + list pages.
 *
 * Primitive sets:
 *  - B.1 dashboards : DashboardWidget, ActivityFeed, EmptyState, ChartCard
 *  - B.2 data views : EntitySearch, SavedViews, BulkActionsBar, CrossEntityTabs
 *  - B.3 board views: KanbanBoard, TimelineView, CalendarView
 */

// ─── B.1 — dashboard primitives ─────────────────────────────────────────────
export { DashboardWidget } from './dashboard-widget';
export type {
  DashboardWidgetProps,
  DashboardWidgetVariant,
  DashboardWidgetOsSlug,
} from './dashboard-widget';

export { ActivityFeed } from './activity-feed';
export type {
  ActivityFeedProps,
  ActivityEvent,
  ActivityTone,
} from './activity-feed';

export { EmptyState } from './empty-state';
export type { EmptyStateProps, EmptyStateAction } from './empty-state';

export { ChartCard } from './chart-card';
export type {
  ChartCardProps,
  ChartKind,
  ChartSeries,
  ChartRange,
} from './chart-card';

// ─── B.2 — data-view primitives ─────────────────────────────────────────────
export { EntitySearch } from './entity-search';
export type {
  EntitySearchProps,
  EntitySearchResult,
} from './entity-search';

export { SavedViews } from './saved-views';
export type { SavedViewsProps, SavedView } from './saved-views';

export { BulkActionsBar } from './bulk-actions-bar';
export type { BulkActionsBarProps, BulkAction } from './bulk-actions-bar';

export { CrossEntityTabs } from './cross-entity-tabs';
export type { CrossEntityTabsProps, CrossEntityTab } from './cross-entity-tabs';

// ─── B.3 — board / view primitives ──────────────────────────────────────────
export { KanbanBoard } from './kanban-board';
export type {
  KanbanBoardProps,
  KanbanColumn,
  KanbanItemBase,
  KanbanMoveEvent,
} from './kanban-board';

export { TimelineView, computeGeometry, defaultTimelineItem } from './timeline-view';
export type {
  TimelineViewProps,
  TimelineRange,
  TimelineLane,
  TimelineItemBase,
  TimelineItemGeometry,
} from './timeline-view';

export { CalendarView } from './calendar-view';
export type { CalendarViewProps, CalendarViewMode } from './calendar-view';

// Calendar grid-math utilities + the shared `CalendarCell` shape. The
// canonical `OsSlug` union lives in `lib/agentic-os/registry.ts`, not here.
export {
  utcDay,
  dateKey,
  isSameUtcDay,
  addUtcMonths,
  addUtcDays,
  startOfUtcWeek,
  buildMonthGrid,
  buildWeekGrid,
  monthLabel,
  weekRangeLabel,
  WEEKDAY_LABELS,
} from './calendar-view.utils';
export type { CalendarCell } from './calendar-view.utils';
