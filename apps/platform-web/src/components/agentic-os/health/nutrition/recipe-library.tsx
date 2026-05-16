'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { Spinner } from '@/components/agentic-os/_shared/views';

export interface RecipeLibraryItem {
  id: string;
  name: string;
  servings: number;
  tags: string[];
  imageUrl: string | null;
  description: string | null;
  updatedAt: string;
}

export interface RecipeLibraryProps {
  initialRecipes: RecipeLibraryItem[];
}

export function RecipeLibrary({ initialRecipes }: RecipeLibraryProps) {
  const [q, setQ] = useState('');
  const [recipes, setRecipes] = useState<RecipeLibraryItem[]>(initialRecipes);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const url = q.trim()
          ? `/api/tiresias/agentic-os/health/recipes?q=${encodeURIComponent(q.trim())}`
          : `/api/tiresias/agentic-os/health/recipes`;
        const r = await fetch(url, { cache: 'no-store' });
        const j = await r.json();
        if (!active) return;
        setRecipes(j.recipes ?? []);
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recipes"
            className="w-full rounded-lg border border-border-subtle bg-surface-0 py-2 pl-9 pr-3 text-sm text-white placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
        </label>
        <Link
          href="/dashboard/os/health/recipes/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" />
          Create recipe
        </Link>
        {loading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <Spinner size="xs" />
            Loading…
          </span>
        )}
      </div>

      {recipes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-2 p-8 text-center text-sm text-text-secondary">
          No recipes yet. Create your first to plan meals and roll up nutrition.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {recipes.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden hover:border-accent/50 transition"
            >
              <Link
                href={`/dashboard/os/health/recipes/${r.id}`}
                className="block"
              >
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.imageUrl}
                    alt=""
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="h-20 bg-gradient-to-br from-accent/15 to-border-subtle" />
                )}
                <div className="p-4">
                  <div className="text-sm font-semibold text-white truncate">
                    {r.name}
                  </div>
                  <div className="mt-0.5 text-xs text-text-secondary">
                    {r.servings} serving{r.servings === 1 ? '' : 's'}
                  </div>
                  {r.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-border-subtle bg-surface-0 px-2 py-0.5 text-[10px] text-text-primary"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
