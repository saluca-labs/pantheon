'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, Copy } from 'lucide-react';

export interface WorkoutLibraryItem {
  id: string;
  source: 'system' | 'custom';
  name: string;
  category: string;
  description: string | null;
  targetIntensity: 'light' | 'moderate' | 'vigorous';
  estDurationMin: number;
  tags: string[];
  blockCount: number | null;
}

const CATEGORIES = ['all', 'cardio', 'strength', 'mobility', 'mixed'] as const;
const SOURCES = ['all', 'system', 'custom'] as const;

const INTENSITY_COLOR: Record<string, string> = {
  light: 'text-emerald-300',
  moderate: 'text-accent',
  vigorous: 'text-amber-300',
};

export function WorkoutLibrary({
  initialTemplates,
}: {
  initialTemplates: WorkoutLibraryItem[];
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all');
  const [source, setSource] = useState<(typeof SOURCES)[number]>('all');
  const [templates, setTemplates] =
    useState<WorkoutLibraryItem[]>(initialTemplates);
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set('q', q.trim());
        if (category !== 'all') params.set('category', category);
        if (source !== 'all') params.set('source', source);
        const url =
          '/api/tiresias/agentic-os/health/workouts' +
          (params.toString() ? `?${params.toString()}` : '');
        const r = await fetch(url, { cache: 'no-store' });
        const j = await r.json();
        if (!active) return;
        setTemplates(j.templates ?? []);
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [q, category, source]);

  const clone = async (id: string) => {
    setCloning(id);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/health/workouts/${id}/clone`,
        { method: 'POST' },
      );
      const j = await r.json();
      if (r.ok && j.template?.id) {
        router.push(`/dashboard/os/health/workouts/${j.template.id}`);
      }
    } finally {
      setCloning(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search workouts"
            className="w-full rounded-lg border border-border-subtle bg-surface-0 py-2 pl-9 pr-3 text-sm text-white placeholder:text-[#64748b] focus:border-accent focus:outline-none"
          />
        </label>
        <select
          value={category}
          onChange={(e) =>
            setCategory(e.target.value as (typeof CATEGORIES)[number])
          }
          className="rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c === 'all' ? 'All categories' : c}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) =>
            setSource(e.target.value as (typeof SOURCES)[number])
          }
          className="rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s === 'all'
                ? 'All sources'
                : s === 'system'
                  ? 'Built-in'
                  : 'My templates'}
            </option>
          ))}
        </select>
        <Link
          href="/dashboard/os/health/workouts/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-[#3a56d4]"
        >
          <Plus className="h-4 w-4" />
          Create workout
        </Link>
        {loading && <span className="text-xs text-text-secondary">Loading…</span>}
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-2 p-8 text-center text-sm text-text-secondary">
          No workouts match. Adjust filters or create a new template.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-border-subtle bg-surface-2 p-4 hover:border-accent/50 transition flex flex-col"
            >
              <Link
                href={`/dashboard/os/health/workouts/${t.id}`}
                className="block flex-1"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] uppercase tracking-wide rounded-full border border-border-subtle px-2 py-0.5 ${
                      t.source === 'system'
                        ? 'text-accent'
                        : 'text-text-primary'
                    }`}
                  >
                    {t.source === 'system' ? 'Built-in' : 'Custom'}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-text-secondary">
                    {t.category}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white">{t.name}</div>
                <div className="mt-0.5 text-xs text-text-secondary">
                  {t.estDurationMin} min ·{' '}
                  <span className={INTENSITY_COLOR[t.targetIntensity]}>
                    {t.targetIntensity}
                  </span>
                  {typeof t.blockCount === 'number' && (
                    <>
                      {' '}
                      · {t.blockCount} block
                      {t.blockCount === 1 ? '' : 's'}
                    </>
                  )}
                </div>
                {t.description && (
                  <p className="mt-2 text-xs text-text-primary leading-snug line-clamp-3">
                    {t.description}
                  </p>
                )}
                {t.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border-subtle bg-surface-0 px-2 py-0.5 text-[10px] text-text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
              {t.source === 'system' && (
                <button
                  type="button"
                  onClick={() => clone(t.id)}
                  disabled={cloning === t.id}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-surface-0 px-3 py-1.5 text-xs text-text-primary hover:border-accent/50 hover:text-white disabled:opacity-60"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {cloning === t.id ? 'Cloning…' : 'Use as starting point'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
