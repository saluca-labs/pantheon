/**
 * Pantheon UI Depth Wave — `KanbanBoard` shared view primitive (Wave B.3).
 *
 * A generic drag-to-stage board built on `@dnd-kit`. Columns + cards, both
 * generic over their data shape. The consumer supplies a `renderCard`
 * render-prop and an `onMove` callback — props in, callbacks out, no backend
 * coupling. Generalizes `business/deal-kanban.tsx` (currently the only kanban
 * in the codebase).
 *
 * Design contract: tokens only (see `_design/tokens.md` / `visual-language.md`).
 * Per-OS accent applied via the optional `slug` prop (column header dot +
 * active drop-target ring) — accents identify, they don't flood-fill.
 *
 * Motion: CSS transitions only (decision 5.3). dnd-kit's transform is applied
 * inline because it's a per-frame drag value, not a static style.
 *
 * @license MIT — Tiresias platform (internal).
 */

'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import type { OsSlug } from './CalendarView.utils';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A board column. `id` is the stage key items are matched against. */
export interface KanbanColumn {
  id: string;
  title: string;
  /** Optional work-in-progress soft cap. Exceeding it flags the column header. */
  wipLimit?: number;
}

/**
 * Minimal shape every kanban item must satisfy: a stable `id` and the
 * `columnId` it currently belongs to. Everything else is consumer-defined and
 * surfaced through `renderCard`.
 */
export interface KanbanItemBase {
  id: string;
  columnId: string;
}

/** Payload handed to `onMove` when a card is dropped into a new column. */
export interface KanbanMoveEvent {
  itemId: string;
  fromColumnId: string;
  toColumnId: string;
}

export interface KanbanBoardProps<TItem extends KanbanItemBase> {
  columns: KanbanColumn[];
  items: TItem[];
  /** Render-prop for a single card. `isDragging` is true for the drag overlay. */
  renderCard: (item: TItem, ctx: { isDragging: boolean }) => React.ReactNode;
  /** Fired when a card lands in a different column. Not fired for same-column noops. */
  onMove: (event: KanbanMoveEvent) => void;
  /** Optional custom column header. Falls back to a title + count + WIP chip. */
  columnHeader?: (column: KanbanColumn, count: number) => React.ReactNode;
  /** Optional per-OS accent for the column dot + active drop ring. */
  slug?: OsSlug;
  /** Per-column empty copy. Defaults to a neutral plainspoken line. */
  emptyColumnLabel?: (column: KanbanColumn) => string;
  className?: string;
}

// ─── Sortable card ──────────────────────────────────────────────────────────

function SortableCard<TItem extends KanbanItemBase>({
  item,
  renderCard,
}: {
  item: TItem;
  renderCard: KanbanBoardProps<TItem>['renderCard'];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, data: { columnId: item.columnId } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid={`kanban-card-${item.id}`}
      className="cursor-grab touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
    >
      {renderCard(item, { isDragging })}
    </div>
  );
}

// ─── Column ─────────────────────────────────────────────────────────────────

function Column<TItem extends KanbanItemBase>({
  column,
  items,
  renderCard,
  columnHeader,
  slug,
  emptyColumnLabel,
}: {
  column: KanbanColumn;
  items: TItem[];
  renderCard: KanbanBoardProps<TItem>['renderCard'];
  columnHeader?: KanbanBoardProps<TItem>['columnHeader'];
  slug?: OsSlug;
  emptyColumnLabel?: KanbanBoardProps<TItem>['emptyColumnLabel'];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const overWip =
    column.wipLimit !== undefined && items.length > column.wipLimit;

  return (
    <div
      data-testid={`kanban-column-${column.id}`}
      className={clsx(
        'flex max-h-[70vh] w-[300px] flex-shrink-0 flex-col rounded-xl border bg-surface-2 transition-slow',
        isOver
          ? slug
            ? `border-os-${slug}`
            : 'border-accent'
          : 'border-border-subtle',
      )}
    >
      {columnHeader ? (
        columnHeader(column, items.length)
      ) : (
        <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'h-2 w-2 rounded-full',
                slug ? `bg-os-${slug}` : 'bg-accent',
              )}
            />
            <span className="text-xs font-semibold text-text-primary">
              {column.title}
            </span>
            <span className="text-xs tabular-nums text-text-tertiary">
              {items.length}
            </span>
          </div>
          {column.wipLimit !== undefined && (
            <span
              className={clsx(
                'rounded px-1.5 py-0.5 text-2xs font-medium tabular-nums',
                overWip
                  ? 'bg-attention/15 text-attention'
                  : 'bg-surface-3 text-text-tertiary',
              )}
            >
              {items.length}/{column.wipLimit}
            </span>
          )}
        </div>
      )}

      <div ref={setNodeRef} className="flex-1 space-y-2 overflow-y-auto p-2">
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <SortableCard key={item.id} item={item} renderCard={renderCard} />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <p className="py-6 text-center text-xs text-text-tertiary">
            {emptyColumnLabel
              ? emptyColumnLabel(column)
              : `Nothing in ${column.title.toLowerCase()} yet.`}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Board ──────────────────────────────────────────────────────────────────

export function KanbanBoard<TItem extends KanbanItemBase>({
  columns,
  items,
  renderCard,
  onMove,
  columnHeader,
  slug,
  emptyColumnLabel,
  className,
}: KanbanBoardProps<TItem>) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const itemsByColumn = useMemo(() => {
    const map = new Map<string, TItem[]>();
    for (const col of columns) map.set(col.id, []);
    for (const item of items) {
      const bucket = map.get(item.columnId);
      if (bucket) bucket.push(item);
    }
    return map;
  }, [columns, items]);

  const activeItem = useMemo(
    () => (activeId ? items.find((i) => i.id === activeId) ?? null : null),
    [activeId, items],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const fromColumnId = (active.data.current?.columnId as string) ?? null;
    if (!fromColumnId) return;

    // `over` can be either another card or the column droppable itself.
    const overColumnId =
      (over.data.current?.columnId as string | undefined) ??
      (columns.some((c) => c.id === over.id) ? String(over.id) : null);
    if (!overColumnId || overColumnId === fromColumnId) return;

    onMove({
      itemId: String(active.id),
      fromColumnId,
      toColumnId: overColumnId,
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div
        data-testid="kanban-board"
        className={clsx('flex gap-3 overflow-x-auto pb-4', className)}
      >
        {columns.map((column) => (
          <Column
            key={column.id}
            column={column}
            items={itemsByColumn.get(column.id) ?? []}
            renderCard={renderCard}
            columnHeader={columnHeader}
            slug={slug}
            emptyColumnLabel={emptyColumnLabel}
          />
        ))}
      </div>
      <DragOverlay>
        {activeItem ? renderCard(activeItem, { isDragging: true }) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default KanbanBoard;
