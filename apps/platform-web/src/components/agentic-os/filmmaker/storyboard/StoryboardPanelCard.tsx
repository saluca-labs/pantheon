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
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-2 transition-slow hover:border-os-filmmaker/40">
      <div className="relative flex aspect-video items-center justify-center border-b border-border-subtle bg-surface-0">
        {panel.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={panel.imageUrl}
            alt={`Panel ${panel.position}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-xs text-text-tertiary">No image</span>
        )}
        <span className="absolute left-2 top-2 rounded bg-surface-0/85 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-os-filmmaker ring-1 ring-os-filmmaker/30">
          {panel.position.toString().padStart(2, '0')}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-primary">
            Panel {panel.position}
          </span>
          {panel.durationSeconds != null ? (
            <span className="text-2xs tabular-nums text-text-tertiary">
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
          <p className="text-xs leading-relaxed text-text-primary">
            {truncate(panel.description, 140)}
          </p>
        ) : null}

        {panel.dialogueExcerpt ? (
          <p className="text-[11px] italic text-text-secondary">
            "{truncate(panel.dialogueExcerpt, 80)}"
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              className="rounded p-1 text-text-secondary transition hover:bg-surface-3 hover:text-text-primary disabled:opacity-30"
              aria-label="Move up"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              className="rounded p-1 text-text-secondary transition hover:bg-surface-3 hover:text-text-primary disabled:opacity-30"
              aria-label="Move down"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded p-1 text-text-secondary transition hover:bg-surface-3 hover:text-text-primary"
              aria-label="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-text-secondary transition hover:bg-surface-3 hover:text-danger"
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-border-subtle bg-surface-0 px-1.5 py-0.5 text-2xs text-text-primary">
      {children}
    </span>
  );
}
