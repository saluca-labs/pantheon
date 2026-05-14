'use client';

/**
 * Creator OS Phase 1 — Recursive sidebar note tree.
 *
 * Builds a nested tree from a flat list of notes using parentId. Supports
 * expand/collapse and active state highlighting. Links each note to its
 * detail page.
 *
 * @license MIT — Tiresias Creator OS Phase 1 (internal).
 */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, Plus } from 'lucide-react';
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

function NoteTreeItem({
  node,
  depth,
  currentNoteId,
}: {
  node: TreeNode;
  depth: number;
  currentNoteId?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isActive = node.note.id === currentNoteId;

  return (
    <li>
      <div
        className={`group flex items-center gap-1 py-1 pr-2 rounded-md transition ${
          isActive
            ? 'bg-accent/15 text-white'
            : 'text-text-secondary hover:text-white hover:bg-surface-2'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
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

      {/* Children */}
      {hasChildren && expanded && (
        <ul className="list-none">
          {node.children.map((child) => (
            <NoteTreeItem
              key={child.note.id}
              node={child}
              depth={depth + 1}
              currentNoteId={currentNoteId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function NoteTree({ notes, currentNoteId }: NoteTreeProps) {
  const tree = useMemo(() => buildTree(notes), [notes]);

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
          <ul className="list-none">
            {tree.map((node) => (
              <NoteTreeItem
                key={node.note.id}
                node={node}
                depth={0}
                currentNoteId={currentNoteId}
              />
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}
