'use client';

/**
 * Creator OS Phase 5 — Video player component.
 *
 * Wraps Video.js with HLS support. Initializes the player on a video element
 * ref inside a useEffect and disposes it on unmount.
 *
 * @license MIT — Tiresias Creator OS Phase 5 (internal).
 */

import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

interface VideoPlayerProps {
  /** HLS manifest URL (e.g. https://cdn.example.com/videos/abc/index.m3u8). */
  src: string;
  /** Display title, used for the poster overlay. */
  title: string;
}

export function VideoPlayer({ src, title }: VideoPlayerProps) {
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
    <div className="rounded-lg overflow-hidden border border-[#2a2d3e] bg-[#0f1117]">
      <video
        ref={videoRef}
        className="video-js vjs-big-play-centered"
        title={title}
      />
    </div>
  );
}
