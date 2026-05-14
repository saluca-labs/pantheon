'use client';

/**
 * Creator OS Phase 5 — Video player component.
 *
 * Wraps Video.js with HLS support. Initializes the player on a video element
 * ref inside a useEffect and disposes it on unmount.
 *
 * Wave D-4b (UI Depth Wave) — player chrome polish:
 *   The bare Video.js surface now sits inside token-driven chrome — an
 *   optional header strip with a play-glyph badge, the video title, and an
 *   optional subtitle (duration / status). The player itself is unchanged;
 *   the chrome only renders when a `subtitle` is supplied so detail pages
 *   that already print their own header don't get a doubled title.
 *
 * @license MIT — Tiresias Creator OS Phase 5 (internal).
 */

import { useEffect, useRef } from 'react';
import { PlayCircle } from 'lucide-react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

interface VideoPlayerProps {
  /** HLS manifest URL (e.g. https://cdn.example.com/videos/abc/index.m3u8). */
  src: string;
  /** Display title, used for the poster overlay + optional chrome header. */
  title: string;
  /** Optional second line — e.g. duration or processing status. When set,
   *  the chrome header renders; when omitted, only the player frame shows. */
  subtitle?: string;
}

export function VideoPlayer({ src, title, subtitle }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<ReturnType<typeof videojs> | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const player = videojs(el, {
      controls: true,
      fluid: true,
      responsive: true,
      preload: 'auto',
      sources: [
        {
          src,
          type: 'application/vnd.apple.mpegurl',
        },
      ],
    });

    playerRef.current = player;

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [src]);

  return (
    <div
      data-testid="video-player"
      className="rounded-xl overflow-hidden border border-border-subtle bg-surface-2"
    >
      {subtitle && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-surface-1">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-os-creator/15 text-os-creator">
            <PlayCircle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">
              {title}
            </p>
            <p className="truncate text-xs text-text-secondary">{subtitle}</p>
          </div>
        </div>
      )}
      <div className="bg-surface-0">
        <video
          ref={videoRef}
          className="video-js vjs-big-play-centered"
          title={title}
        />
      </div>
    </div>
  );
}
