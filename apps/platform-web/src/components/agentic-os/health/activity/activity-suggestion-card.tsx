'use client';

/**
 * Small card that calls /api/.../activity/suggest and renders today's
 * recommended intensity + rationale. Shared by the trends dashboard and
 * the activity-plan page header.
 */

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Spinner } from '@/components/agentic-os/_shared/views';

type Intensity = 'light' | 'moderate' | 'vigorous' | 'rest';

interface Suggestion {
  intensity: Intensity;
  rationale: string;
}

const INTENSITY_LABEL: Record<Intensity, string> = {
  light: 'Light',
  moderate: 'Moderate',
  vigorous: 'Vigorous',
  rest: 'Rest day',
};

const INTENSITY_COLOR: Record<Intensity, string> = {
  light: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  moderate: 'text-accent bg-accent/10 border-accent/40',
  vigorous: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  rest: 'text-text-primary bg-surface-0 border-border-subtle',
};

export function ActivitySuggestionCard({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [data, setData] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const r = await fetch(
          '/api/tiresias/agentic-os/health/activity/suggest',
          { cache: 'no-store' },
        );
        const j = await r.json();
        if (!active) return;
        if (!r.ok) {
          setError(j.error ?? 'Failed to load suggestion');
          return;
        }
        setData({ intensity: j.intensity, rationale: j.rationale });
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'Failed to load suggestion');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 flex items-center gap-2 text-xs text-text-secondary">
        <Spinner size="sm" />
        Loading today&rsquo;s suggestion…
      </div>
    );
  }
  if (error || !data) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-accent/10 p-2 text-accent">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Today&rsquo;s suggestion
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${INTENSITY_COLOR[data.intensity]}`}
            >
              {INTENSITY_LABEL[data.intensity]}
            </span>
          </div>
          {!compact && (
            <p className="mt-1.5 text-sm text-text-primary leading-snug">
              {data.rationale}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
