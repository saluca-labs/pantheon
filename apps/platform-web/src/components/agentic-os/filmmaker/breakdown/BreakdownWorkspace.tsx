'use client';

/**
 * Filmmaker OS — BreakdownWorkspace.
 *
 * Client wrapper around the per-scene editors. Tracks which scene row
 * is expanded so the page stays compact.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { ScreenplayScene } from '@/lib/agentic-os/filmmaker/screenplays';
import type {
  BreakdownElement,
  SceneBreakdownMeta,
} from '@/lib/agentic-os/filmmaker/breakdown';
import {
  SCENE_STATUSES,
  type SceneStatus,
  pagesLabel,
} from '@/lib/agentic-os/filmmaker/breakdown';
import { BreakdownSummaryChips } from './BreakdownSummaryChips';
import { SceneBreakdownEditor } from './SceneBreakdownEditor';

interface Props {
  scenes: ScreenplayScene[];
  elementsByScene: Record<string, BreakdownElement[]>;
  metaByScene: Record<string, SceneBreakdownMeta | null>;
}

function statusBadge(status: SceneStatus) {
  const info = SCENE_STATUSES.find((s) => s.status === status);
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border ${info?.color ?? 'border-[#2a2d3e] text-[#94a3b8]'}`}
    >
      {info?.label ?? status}
    </span>
  );
}

export function BreakdownWorkspace({
  scenes,
  elementsByScene,
  metaByScene,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (scenes.length === 0) {
    return (
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-8 text-center">
        <p className="text-sm text-[#94a3b8]">
          No scenes yet. Write some Fountain in the screenplay editor and save
          a draft — your scenes will appear here for breakdown.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled
          title="Coming with AI coach — Phase 7"
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-[#2a2d3e] bg-[#1a1d27] text-[#64748b] cursor-not-allowed"
        >
          <Sparkles className="w-3 h-3" /> Auto-extract from script
        </button>
      </div>

      <ul className="space-y-2">
        {scenes.map((scene) => {
          const isOpen = expanded.has(scene.id);
          const elements = elementsByScene[scene.id] ?? [];
          const meta = metaByScene[scene.id] ?? null;
          const intExt =
            scene.interior === true ? 'INT.' : scene.interior === false ? 'EXT.' : '';
          return (
            <li
              key={scene.id}
              className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggle(scene.id)}
                className="w-full text-left p-3 hover:bg-[#1f2230] transition flex items-start gap-3"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-[#94a3b8] mt-0.5 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[#94a3b8] mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-[#64748b] font-mono">
                      {scene.sceneNumber.toString().padStart(2, '0')}
                    </span>
                    <p className="text-sm text-white truncate">
                      {intExt && <span className="text-[#94a3b8] mr-1">{intExt}</span>}
                      {scene.location ?? scene.heading}
                      {scene.timeOfDay && (
                        <span className="text-[#94a3b8]"> — {scene.timeOfDay}</span>
                      )}
                    </p>
                    {meta && statusBadge(meta.status)}
                    {meta && meta.eighths > 0 && (
                      <span className="text-[10px] text-[#94a3b8] font-mono">
                        {pagesLabel(meta.eighths)} pp
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5">
                    <BreakdownSummaryChips elements={elements} />
                  </div>
                </div>
              </button>
              {isOpen && (
                <SceneBreakdownEditor
                  scene={scene}
                  initialElements={elements}
                  initialMeta={meta}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
