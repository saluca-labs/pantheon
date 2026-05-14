'use client';

/**
 * Filmmaker OS — ScreenplaySceneList.
 *
 * Sidebar list of parsed scenes for the head version. Clicking a scene
 * dispatches `onJumpToScene(sceneNumber)` so the parent can scroll the
 * editor.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import type { ScreenplayScene } from '@/lib/agentic-os/filmmaker/screenplays';

interface Props {
  scenes: ScreenplayScene[];
  onJumpToScene?: (scene: ScreenplayScene) => void;
}

function describeInterior(interior: boolean | null): string {
  if (interior === true) return 'INT.';
  if (interior === false) return 'EXT.';
  return '';
}

export function ScreenplaySceneList({ scenes, onJumpToScene }: Props) {
  if (scenes.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
        <h3 className="text-sm font-semibold text-white mb-2">Scenes</h3>
        <p className="text-xs text-text-secondary">
          No scenes yet. Add a scene heading (e.g. <span className="text-white">INT. ROOM - DAY</span>)
          and save a draft.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
      <h3 className="text-sm font-semibold text-white mb-3">
        Scenes <span className="text-text-secondary font-normal">({scenes.length})</span>
      </h3>
      <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
        {scenes.map((scene) => {
          const tot = Object.values(scene.dialogueWordCounts).reduce((a, b) => a + b, 0);
          const prefix = describeInterior(scene.interior);
          return (
            <li key={scene.id}>
              <button
                type="button"
                onClick={() => onJumpToScene?.(scene)}
                className="w-full text-left rounded-lg border border-border-subtle bg-surface-0 p-2.5 hover:border-accent/60 transition group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-[#64748b] font-mono">
                      {scene.sceneNumber.toString().padStart(2, '0')}
                      {' · '}
                      <span className="text-text-secondary">p. {Number(scene.pageStart ?? 0).toFixed(1)}</span>
                    </p>
                    <p className="text-sm text-white group-hover:text-accent transition truncate">
                      {prefix ? <span className="text-text-secondary mr-1">{prefix}</span> : null}
                      {scene.location ?? scene.heading}
                      {scene.timeOfDay ? (
                        <span className="text-text-secondary"> — {scene.timeOfDay}</span>
                      ) : null}
                    </p>
                  </div>
                  <span className="text-[10px] text-text-secondary shrink-0 mt-1">
                    {tot} dlg
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
