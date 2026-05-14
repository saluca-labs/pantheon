'use client';

/**
 * Creator OS Phase 1 — Recursive sidebar note tree.
 *
 * Builds a nested tree from a flat list of notes using parentId. Supports
 * expand/collapse and active state highlighting. Links each note to its
 * detail page.
 *
 * Wave D-4b (UI Depth Wave) — drag-drop reorder polish:
 *   The tree now supports drag-to-reorder within a sibling group via
 *   `@dnd-kit` (already a repo dependency — see `book-editor.tsx`). Polish:
 *     - A grip handle appears on hover; only the handle starts a drag, so
 *       clicking the note label still navigates.
 *     - The dragged row dims; a drop indicator line shows where it will land.
 *     - Reorder persists optimistically via `PATCH …/notes/:id { position }`;
 *       on failure the previous order is restored.
 *     - `PointerSensor` has an 8px activation distance so a click is never
 *       mistaken for a drag.
 *   Cross-parent moves stay out of scope (the API supports `parentId` but the
 *   sidebar UX for nesting is a larger surface) — siblings reorder cleanly.
 *
 * @license MIT — Tiresias Creator OS Phase 1 (internal).
 */

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, Plus, GripVertical } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CreatorNote } from '@/lib/agentic-os/creator/notes';

interface NoteTreeProps {
  notes: CreatorNote[];
  currentNoteId?: string;
}

interface TreeNode {
  note: CreatorNote;
  children: TreeNode[];
}

function buildTree(notes: CreatorNote[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const note of notes) {
    map.set(note.id, { note, children: [] });
  }

  for (const note of notes) {
    const node = map.get(note.id)!;
    if (note.parentId && map.has(note.parentId)) {
      map.get(note.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ─── Sortable note row ──────────────────────────────────────────────────────

function NoteTreeItem({
  node,
  depth,
  currentNoteId,
  onReorderChildren,
}: {
  node: TreeNode;
  depth: number;
  currentNoteId?: string;
  onReorderChildren: (parentId: string | null, orderedIds: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isActive = node.note.id === currentNoteId;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: node.note.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} data-note-id={node.note.id}>
      {/* Drop indicator — a tinted line above the row the drag will land on. */}
      {isOver && !isDragging && (
        <div
          data-testid="note-tree-drop-indicator"
          className="h-0.5 rounded-full bg-os-creator/70 mx-2 mb-0.5"
        />
      )}
      <div
        className={`group flex items-center gap-1 py-1 pr-2 rounded-md transition ${
          isActive
            ? 'bg-accent/15 text-white'
            : 'text-text-secondary hover:text-white hover:bg-surface-2'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Drag handle — only the handle initiates a drag, so the link still
            navigates on a plain click. Hidden until row hover. */}
        <button
          type="button"
          aria-label={`Reorder ${node.note.title || 'Untitled'}`}
          className="p-0.5 rounded text-text-secondary/40 opacity-0 group-hover:opacity-100 hover:text-white cursor-grab active:cursor-grabbing transition flex-shrink-0 touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3 h-3" />
        </button>

        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setExpanded((v) => !v);
            }}
            className="p-0.5 rounded hover:bg-border-subtle transition flex-shrink-0"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          </button>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}

        {/* Note link */}
        <Link
          href={`/dashboard/os/creator/notes/${node.note.id}`}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          {node.note.icon ? (
            <span className="text-sm flex-shrink-0">{node.note.icon}</span>
          ) : (
            <FileText className="w-3.5 h-3.5 text-text-secondary/60 flex-shrink-0" />
          )}
          <span className="text-sm truncate">
            {node.note.title || 'Untitled'}
          </span>
        </Link>
      </div>

      {/* Children — each sibling group is its own sortable context. */}
      {hasChildren && expanded && (
        <NoteTreeLevel
          nodes={node.children}
          parentId={node.note.id}
          depth={depth + 1}
          currentNoteId={currentNoteId}
          onReorderChildren={onReorderChildren}
        />
      )}
    </li>
  );
}

// ─── Sortable sibling group ─────────────────────────────────────────────────

function NoteTreeLevel({
  nodes,
  parentId,
  depth,
  currentNoteId,
  onReorderChildren,
}: {
  nodes: TreeNode[];
  parentId: string | null;
  depth: number;
  currentNoteId?: string;
  onReorderChildren: (parentId: string | null, orderedIds: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const ids = nodes.map((n) => n.note.id);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderChildren(parentId, arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="list-none">
          {nodes.map((child) => (
            <NoteTreeItem
              key={child.note.id}
              node={child}
              depth={depth}
              currentNoteId={currentNoteId}
              onReorderChildren={onReorderChildren}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

// ─── NoteTree ───────────────────────────────────────────────────────────────

export function NoteTree({ notes, currentNoteId }: NoteTreeProps) {
  // Local working copy so reorders apply optimistically.
  const [items, setItems] = useState<CreatorNote[]>(notes);

  useEffect(() => {
    setItems(notes);
  }, [notes]);

  const tree = useMemo(() => buildTree(items), [items]);

  async function persistReorder(orderedIds: string[], prev: CreatorNote[]) {
    const results = await Promise.all(
      orderedIds.map((id, index) =>
        fetch(`/api/tiresias/agentic-os/creator/notes/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: index }),
        })
          .then((r) => r.ok)
          .catch(() => false),
      ),
    );
    // If any write failed, roll back to the pre-drag order.
    if (results.some((ok) => !ok)) {
      setItems(prev);
    }
  }

  function handleReorderChildren(
    parentId: string | null,
    orderedIds: string[],
  ) {
    setItems((prev) => {
      // Re-assign `position` for every sibling in the affected group.
      const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
      const next = prev.map((n) => {
        const sameGroup = (n.parentId ?? null) === parentId;
        if (sameGroup && orderMap.has(n.id)) {
          return { ...n, position: orderMap.get(n.id)! };
        }
        return n;
      });
      void persistReorder(orderedIds, prev);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-subtle">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Notes
        </h2>
        <Link
          href="/dashboard/os/creator/notes/new"
          className="p-1 rounded hover:bg-border-subtle text-text-secondary hover:text-white transition"
          title="New Note"
        >
          <Plus className="w-4 h-4" />
        </Link>
      </div>

      {/* Tree */}
      <nav className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <p className="px-4 py-6 text-xs text-text-secondary/60 text-center">
            No notes yet. Create your first note to get started.
          </p>
        ) : (
          <NoteTreeLevel
            nodes={tree}
            parentId={null}
            depth={0}
            currentNoteId={currentNoteId}
            onReorderChildren={handleReorderChildren}
          />
        )}
      </nav>
    </div>
  );
}
