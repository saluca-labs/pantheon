'use client';

import { useState } from 'react';
import { Brain, Clock, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type {
  MeditationCatalogEntry,
  MeditationGoalTag,
} from '@/lib/agentic-os/health/meditation-catalog';

interface Props {
  catalog: MeditationCatalogEntry[];
  source: 'medito' | 'static';
}

const GOALS: { value: MeditationGoalTag | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'stress', label: 'Stress' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'focus', label: 'Focus' },
  { value: 'general', label: 'General' },
];

export function MeditationCatalogBrowser({ catalog, source }: Props) {
  const router = useRouter();
  const [goal, setGoal] = useState<MeditationGoalTag | 'all'>('all');
  const [logging, setLogging] = useState<string | null>(null);

  const filtered =
    goal === 'all'
      ? catalog
      : catalog.filter((c) => c.tags.includes(goal));

  async function logCompleted(entry: MeditationCatalogEntry) {
    setLogging(entry.slug);
    try {
      const r = await fetch(
        '/api/tiresias/agentic-os/health/meditation/sessions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'medito',
            sourceRef: entry.slug,
            durationMin: entry.durationMin,
          }),
        },
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? 'Save failed');
      }
      router.refresh();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[meditate] log failed', e);
    } finally {
      setLogging(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-white">
            Guided sessions
          </h3>
          <span className="text-[10px] uppercase tracking-wide text-text-secondary/70">
            {source === 'medito' ? 'Medito catalog' : 'Static catalog'}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {GOALS.map((g) => (
          <button
            key={g.value}
            type="button"
            onClick={() => setGoal(g.value)}
            className={`text-xs rounded-full border px-3 py-1 transition ${
              goal === g.value
                ? 'border-accent bg-accent/15 text-white'
                : 'border-border-subtle bg-surface-0 text-text-primary hover:border-accent/50'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((entry) => (
          <li
            key={entry.slug}
            className="rounded-xl border border-border-subtle bg-surface-0 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h4 className="text-sm font-medium text-white">{entry.title}</h4>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  {entry.description}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-text-secondary/80">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {entry.durationMin} min
                  </span>
                  <span>{entry.technique}</span>
                </div>
                <p className="text-[10px] text-text-secondary/70 mt-2">
                  {entry.source}
                </p>
              </div>
              <button
                type="button"
                onClick={() => logCompleted(entry)}
                disabled={logging === entry.slug}
                className="inline-flex items-center gap-1 rounded-lg border border-border-subtle hover:border-accent/50 disabled:opacity-60 text-xs text-white px-2 py-1 transition"
                title="Log this session as completed"
              >
                <Plus className="w-3 h-3" />
                {logging === entry.slug ? 'Logging…' : 'Log'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {filtered.length === 0 && (
        <p className="text-sm text-text-secondary">
          No sessions for this filter. Try a different goal.
        </p>
      )}
    </div>
  );
}
