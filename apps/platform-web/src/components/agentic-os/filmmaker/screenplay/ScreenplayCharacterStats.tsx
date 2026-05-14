'use client';

/**
 * Filmmaker OS — ScreenplayCharacterStats.
 *
 * Per-character dialogue word count and scene count, derived from the
 * head version's scenes. Sortable by either column.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useMemo, useState } from 'react';
import type { ScreenplayScene } from '@/lib/agentic-os/filmmaker/screenplays';

interface Props {
  scenes: ScreenplayScene[];
}

type SortKey = 'words' | 'scenes';

interface CharacterRow {
  name: string;
  words: number;
  scenes: number;
}

function aggregate(scenes: ScreenplayScene[]): CharacterRow[] {
  const map = new Map<string, CharacterRow>();
  for (const s of scenes) {
    for (const [name, words] of Object.entries(s.dialogueWordCounts)) {
      const prev = map.get(name) ?? { name, words: 0, scenes: 0 };
      prev.words += Number(words) || 0;
      prev.scenes += 1;
      map.set(name, prev);
    }
  }
  return [...map.values()];
}

export function ScreenplayCharacterStats({ scenes }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('words');

  const rows = useMemo(() => {
    const r = aggregate(scenes);
    r.sort((a, b) =>
      sortKey === 'words' ? b.words - a.words : b.scenes - a.scenes,
    );
    return r;
  }, [scenes, sortKey]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
        <h3 className="text-sm font-semibold text-white mb-2">Characters</h3>
        <p className="text-xs text-text-secondary">
          No dialogue yet. Add CHARACTER cues followed by dialogue lines.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">
          Characters <span className="text-text-secondary font-normal">({rows.length})</span>
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setSortKey('words')}
            className={`text-[11px] px-2 py-0.5 rounded border transition ${
              sortKey === 'words'
                ? 'border-accent/60 text-white bg-accent/20'
                : 'border-border-subtle text-text-secondary hover:text-white'
            }`}
          >
            By words
          </button>
          <button
            type="button"
            onClick={() => setSortKey('scenes')}
            className={`text-[11px] px-2 py-0.5 rounded border transition ${
              sortKey === 'scenes'
                ? 'border-accent/60 text-white bg-accent/20'
                : 'border-border-subtle text-text-secondary hover:text-white'
            }`}
          >
            By scenes
          </button>
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-secondary uppercase text-[10px] tracking-wide">
            <th className="text-left pb-2">Character</th>
            <th className="text-right pb-2">Dialogue words</th>
            <th className="text-right pb-2">Scenes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-border-subtle">
              <td className="py-1.5 text-white font-medium">{r.name}</td>
              <td className="py-1.5 text-right text-text-primary">
                {r.words.toLocaleString()}
              </td>
              <td className="py-1.5 text-right text-text-primary">{r.scenes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
