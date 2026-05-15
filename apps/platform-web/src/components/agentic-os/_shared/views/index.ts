/**
 * Agentic OS shared-view primitives — barrel (Waves B + E.3).
 *
 * Re-exports the shared-view primitives and their public prop / data
 * types so consumers can `import { KanbanBoard, EmptyState } from
 * '@/components/agentic-os/_shared/views'` instead of reaching into
 * individual files. Wave C wired these into the OS hubs + list pages;
 * Wave E.3 adds the Skeleton + Spinner loading primitives so the
 * shimmer divs scattered across the OSes can converge.
 *
 * Primitive sets:
 *  - B.1 dashboards : DashboardWidget, ActivityFeed, EmptyState, ChartCard
 *  - B.2 data views : EntitySearch, SavedViews, KindFilterChips, BulkActionsBar, CrossEntityTabs
 *  - B.3 board views: KanbanBoard, TimelineView, CalendarView
 *  - E.3 loading    : Skeleton, SkeletonGroup, Spinner
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
  FilterDef,
  FilterOption,
  SortOption,
  ViewModeOption,
} from './entity-search';

export { SavedViews } from './saved-views';
export type { SavedViewsProps, SavedView } from './saved-views';

export { KindFilterChips } from './kind-filter-chips';
export type {
  KindFilterChipsProps,
  KindFilterChipOption,
} from './kind-filter-chips';

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
export type {
  CalendarViewProps,
  CalendarViewMode,
  CalendarViewLayout,
  CalendarViewDateGridProps,
  CalendarViewSlotGridProps,
  CalendarSlotDef,
  CalendarReorderDirection,
  CalendarReorderEvent,
  CalendarSlotItemAction,
} from './calendar-view';

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

// ─── E.3 — loading primitives ───────────────────────────────────────────────
export { Skeleton, SkeletonGroup } from './skeleton';
export type {
  SkeletonProps,
  SkeletonGroupProps,
  SkeletonVariant,
} from './skeleton';

export { Spinner } from './spinner';
export type { SpinnerProps, SpinnerSize } from './spinner';
