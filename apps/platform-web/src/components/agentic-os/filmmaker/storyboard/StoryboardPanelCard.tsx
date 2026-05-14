'use client';

/**
 * Filmmaker OS — single storyboard panel card.
 *
 * Renders one panel with reorder arrows and edit/delete actions.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { ChevronUp, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import type { StoryboardPanel } from '@/lib/agentic-os/filmmaker/storyboards';

interface Props {
  panel: StoryboardPanel;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + '…';
}

export function StoryboardPanelCard({
  panel,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden flex flex-col">
      <div className="aspect-video bg-surface-0 border-b border-border-subtle flex items-center justify-center">
        {panel.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={panel.imageUrl}
            alt={`Panel ${panel.position}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <span className="text-xs text-[#64748b]">No image</span>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white">
            Panel {panel.position}
          </span>
          {panel.durationSeconds != null ? (
            <span className="text-[10px] text-text-secondary">
              {panel.durationSeconds}s
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1">
          {panel.shotSize ? <Badge>{panel.shotSize}</Badge> : null}
          {panel.cameraAngle ? <Badge>{panel.cameraAngle}</Badge> : null}
          {panel.cameraMove ? <Badge>{panel.cameraMove}</Badge> : null}
        </div>

        {panel.description ? (
          <p className="text-xs text-text-primary leading-relaxed">
            {truncate(panel.description, 140)}
          </p>
        ) : null}

        {panel.dialogueExcerpt ? (
          <p className="text-[11px] italic text-text-secondary">
            "{truncate(panel.dialogueExcerpt, 80)}"
          </p>
        ) : null}

        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-border-subtle">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              className="p-1 rounded text-text-secondary hover:text-white hover:bg-surface-0 disabled:opacity-30 transition"
              aria-label="Move up"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              className="p-1 rounded text-text-secondary hover:text-white hover:bg-surface-0 disabled:opacity-30 transition"
              aria-label="Move down"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="p-1 rounded text-text-secondary hover:text-white hover:bg-surface-0 transition"
              aria-label="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1 rounded text-text-secondary hover:text-red-400 hover:bg-surface-0 transition"
              aria-label="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-primary">
      {children}
    </span>
  );
}
