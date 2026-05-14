'use client';

/**
 * Filmmaker OS — ScheduleStripRow.
 *
 * Single strip in a day's stripboard. Up/down arrows to reorder within
 * day. "Move to..." dropdown to switch days. Delete to remove.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, MoveRight, Trash2 } from 'lucide-react';
import type {
  ScheduleStripJoined,
  ShootingDay,
} from '@/lib/agentic-os/filmmaker/schedule';
import { pagesLabel } from '@/lib/agentic-os/filmmaker/breakdown';

interface Props {
  strip: ScheduleStripJoined;
  day: ShootingDay;
  index: number;
  total: number;
  allDays: ShootingDay[];
}

export function ScheduleStripRow({ strip, day, index, total, allDays }: Props) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);

  async function moveTo(
    toShootingDayId: string | null,
    toOrderIndex: number,
  ) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/filmmaker/strips/${strip.id}/move`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toShootingDayId, toOrderIndex }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Failed to move');
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
      setMoving(false);
    }
  }

  async function deleteStrip() {
    if (!confirm('Remove this scene from the day?')) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/filmmaker/strips/${strip.id}`,
        { method: 'DELETE' },
      );
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const scene = strip.scene;
  const meta = strip.sceneMeta;
  const intExt =
    scene.interior === true ? 'INT.' : scene.interior === false ? 'EXT.' : '';
  const minutes = strip.estMinutes ?? meta?.estShootMinutes ?? null;
  return (
    <li className="rounded-lg border border-border-subtle bg-surface-0 p-2.5">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => moveTo(null, index - 1)}
            disabled={busy || index === 0}
            title="Move up"
            className="text-text-secondary hover:text-white disabled:opacity-20 p-0.5"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => moveTo(null, index + 1)}
            disabled={busy || index === total - 1}
            title="Move down"
            className="text-text-secondary hover:text-white disabled:opacity-20 p-0.5"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-text-tertiary font-mono">
            Scene {scene.sceneNumber.toString().padStart(2, '0')}
            {meta && meta.eighths > 0 && (
              <span className="ml-2 text-text-secondary">
                · {pagesLabel(meta.eighths)} pp
              </span>
            )}
            {minutes != null && (
              <span className="ml-2 text-text-secondary">· {minutes} min</span>
            )}
          </p>
          <p className="text-xs text-text-primary truncate">
            {intExt && <span className="text-text-secondary mr-1">{intExt}</span>}
            {scene.location ?? scene.heading}
            {scene.timeOfDay && (
              <span className="text-text-secondary"> — {scene.timeOfDay}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setMoving((m) => !m)}
            disabled={busy}
            title="Move to another day"
            className="text-text-secondary hover:text-white p-1"
          >
            <MoveRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={deleteStrip}
            disabled={busy}
            title="Remove from day"
            className="text-text-secondary hover:text-danger p-1"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {moving && (
        <div className="mt-2 pt-2 border-t border-border-subtle space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">
            Move to:
          </p>
          <div className="max-h-32 overflow-y-auto">
            {allDays
              .filter((d) => d.id !== day.id)
              .map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => moveTo(d.id, 9999)}
                  disabled={busy}
                  className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-surface-3 text-text-primary disabled:opacity-40"
                >
                  Day {d.dayNumber}
                  {d.label ? ` — ${d.label}` : ''}
                  {d.unit !== 'main' && (
                    <span className="text-text-secondary ml-1">[{d.unit}]</span>
                  )}
                </button>
              ))}
            {allDays.filter((d) => d.id !== day.id).length === 0 && (
              <p className="text-[10px] text-text-tertiary italic px-2">
                No other days to move to.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMoving(false)}
            className="text-[11px] text-text-secondary hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}
