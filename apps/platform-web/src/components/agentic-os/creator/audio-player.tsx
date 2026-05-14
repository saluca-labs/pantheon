'use client';

/**
 * Creator OS — Podcast audio player.
 *
 * Wave D-4b (UI Depth Wave) — player chrome polish:
 *   The bare Plyr `<audio>` in a raw-hex container is now wrapped in
 *   token-driven chrome: a header strip with a play-glyph badge, the episode
 *   title + an optional subtitle (show / duration), all in the visual
 *   language. Raw `zinc-*` hex is replaced with `surface-*` / `border-*` /
 *   `os-creator` tokens. The Plyr controls themselves are unchanged.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { useEffect, useRef } from 'react';
import { Headphones } from 'lucide-react';
import 'plyr/dist/plyr.css';

interface AudioPlayerProps {
  audioUrl: string;
  title: string;
  /** Optional second line — e.g. show name, season/episode, or duration. */
  subtitle?: string;
}

export function AudioPlayer({ audioUrl, title, subtitle }: AudioPlayerProps) {
  const ref = useRef<HTMLAudioElement>(null);
  const plyrRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!ref.current) return;

      const Plyr = (await import('plyr')).default;
      if (cancelled) return;

      plyrRef.current = new Plyr(ref.current!, {
        controls: [
          'play-large',
          'play',
          'progress',
          'current-time',
          'duration',
          'mute',
          'volume',
          'settings',
          'download',
        ],
        settings: ['speed'],
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
      });
    }

    init();

    return () => {
      cancelled = true;
      if (plyrRef.current) {
        plyrRef.current.destroy();
        plyrRef.current = null;
      }
    };
  }, [audioUrl, title]);

  return (
    <div
      data-testid="audio-player"
      className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden"
    >
      {/* Chrome header — play-glyph badge + title + optional subtitle. */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-surface-1">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-os-creator/15 text-os-creator">
          <Headphones className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">
            {title}
          </p>
          {subtitle && (
            <p className="truncate text-xs text-text-secondary">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Plyr audio element */}
      <div className="p-4">
        <audio ref={ref} controls>
          <source src={audioUrl} />
        </audio>
      </div>
    </div>
  );
}
