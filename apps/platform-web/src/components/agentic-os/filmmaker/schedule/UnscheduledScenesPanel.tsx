'use client';

/**
 * Filmmaker OS — UnscheduledScenesPanel.
 *
 * Left-pane list of scenes that have no strip yet. Each scene gets a
 * "Schedule on day…" dropdown that POSTs to the strips route on the
 * selected day. Also offers a "+ new day" shortcut.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Plus } from 'lucide-react';
import type { ScreenplayScene } from '@/lib/agentic-os/filmmaker/screenplays';
import type { ShootingDay } from '@/lib/agentic-os/filmmaker/schedule';
import {
  SHOOTING_UNIT_LABEL,
} from '@/lib/agentic-os/filmmaker/schedule';

interface Props {
  projectId: string;
  scenes: ScreenplayScene[];
  days: ShootingDay[];
}

export function UnscheduledScenesPanel({ projectId, scenes, days }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  async function scheduleOn(sceneId: string, dayId: string) {
    setBusy(sceneId);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/filmmaker/shooting-days/${dayId}/strips`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sceneId }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Failed to schedule');
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
      setPickerFor(null);
    }
  }

  async function newDayAndSchedule(sceneId: string) {
    setBusy(sceneId);
    try {
      const dayRes = await fetch(
        `/api/tiresias/agentic-os/filmmaker/projects/${projectId}/shooting-days`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (!dayRes.ok) {
        alert('Failed to create day');
        return;
      }
      const { day } = await dayRes.json();
      await scheduleOn(sceneId, day.id);
    } finally {
      setBusy(null);
      setPickerFor(null);
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
      <h2 className="text-sm font-semibold text-text-primary mb-1">
        Unscheduled scenes{' '}
        <span className="text-text-secondary font-normal">({scenes.length})</span>
      </h2>
      <p className="text-[11px] text-text-secondary mb-3">
        Click a scene to drop it onto a shooting day.
      </p>
      {scenes.length === 0 ? (
        <p className="text-xs text-text-tertiary italic">
          Every scene is scheduled. Nice work.
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
          {scenes.map((scene) => {
            const intExt =
              scene.interior === true
                ? 'INT.'
                : scene.interior === false
                  ? 'EXT.'
                  : '';
            return (
              <li key={scene.id}>
                <div className="rounded-lg border border-border-subtle bg-surface-0 p-2.5">
                  <p className="text-[11px] text-text-tertiary font-mono">
                    {scene.sceneNumber.toString().padStart(2, '0')}
                  </p>
                  <p className="text-xs text-text-primary truncate">
                    {intExt && <span className="text-text-secondary mr-1">{intExt}</span>}
                    {scene.location ?? scene.heading}
                    {scene.timeOfDay && (
                      <span className="text-text-secondary"> — {scene.timeOfDay}</span>
                    )}
                  </p>
                  {pickerFor === scene.id ? (
                    <div className="mt-2 space-y-1">
                      {days.length === 0 && (
                        <p className="text-[10px] text-text-secondary">
                          No days yet — create the first one below.
                        </p>
                      )}
                      <div className="max-h-32 overflow-y-auto">
                        {days.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => scheduleOn(scene.id, d.id)}
                            disabled={busy === scene.id}
                            className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-surface-3 text-text-primary disabled:opacity-40"
                          >
                            Day {d.dayNumber}
                            {d.label ? ` — ${d.label}` : ''}
                            {d.shootDate ? ` (${d.shootDate})` : ''}
                            {d.unit !== 'main' && (
                              <span className="text-text-secondary ml-1">[{SHOOTING_UNIT_LABEL[d.unit]}]</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
                        <button
                          type="button"
                          onClick={() => newDayAndSchedule(scene.id)}
                          disabled={busy === scene.id}
                          className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline disabled:opacity-40"
                        >
                          <CalendarPlus className="w-3 h-3" /> New day
                        </button>
                        <button
                          type="button"
                          onClick={() => setPickerFor(null)}
                          className="text-[11px] text-text-secondary hover:text-white ml-auto"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPickerFor(scene.id)}
                      disabled={busy === scene.id}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-accent hover:underline disabled:opacity-40"
                    >
                      <Plus className="w-3 h-3" /> Schedule on day…
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
