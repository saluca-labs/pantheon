'use client';

import { useEffect, useRef } from 'react';
import 'plyr/dist/plyr.css';

interface AudioPlayerProps {
  audioUrl: string;
  title: string;
}

export function AudioPlayer({ audioUrl, title }: AudioPlayerProps) {
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <audio ref={ref} controls>
        <source src={audioUrl} />
      </audio>
    </div>
  );
}
