'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import type { JournalPrompt } from '@/lib/agentic-os/health/repo';

interface Props {
  prompts: JournalPrompt[];
  /** Optional: where to navigate on pick. Defaults to /journal/new?prompt=<slug>. */
  hrefBase?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  'cbt-thought-record': 'CBT thought record',
  gratitude: 'Gratitude',
  'values-clarification': 'Values clarification',
  'behavioral-activation': 'Behavioral activation',
  'self-compassion': 'Self-compassion',
};

export function PromptPicker({ prompts, hrefBase }: Props) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Group prompts by category for the listing.
  const byCategory = new Map<string, JournalPrompt[]>();
  for (const p of prompts) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  const categories = Array.from(byCategory.keys()).sort();

  function pick(slug: string) {
    const base = hrefBase ?? '/dashboard/os/health/journal/new';
    router.push(`${base}?prompt=${encodeURIComponent(slug)}`);
  }

  if (prompts.length === 0) {
    return (
      <p className="text-sm text-[#94a3b8]">
        No prompts loaded. Try refreshing — the seed migration may still be
        running.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-[#4361EE]" />
        <h3 className="text-sm font-semibold text-white">
          Pick a prompt to start
        </h3>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <CategoryChip
          label="All"
          active={activeCategory === null}
          onClick={() => setActiveCategory(null)}
        />
        {categories.map((c) => (
          <CategoryChip
            key={c}
            label={CATEGORY_LABELS[c] ?? c}
            active={activeCategory === c}
            onClick={() => setActiveCategory(c)}
          />
        ))}
      </div>

      <div className="space-y-2">
        {(activeCategory ? [activeCategory] : categories).map((c) => (
          <div key={c}>
            <h4 className="text-[10px] uppercase tracking-wide text-[#94a3b8] mb-1.5">
              {CATEGORY_LABELS[c] ?? c}
            </h4>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(byCategory.get(c) ?? []).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pick(p.slug)}
                    className="w-full text-left rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/50 hover:bg-[#1a1d27] transition p-3"
                  >
                    <p className="text-xs text-white leading-relaxed">
                      {p.prompt}
                    </p>
                    {p.source && (
                      <p className="text-[10px] text-[#94a3b8]/70 mt-1.5">
                        {p.source}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[#94a3b8]/70 mt-3">
        Or skip the prompt and{' '}
        <button
          type="button"
          onClick={() => router.push('/dashboard/os/health/journal/new')}
          className="underline hover:text-white"
        >
          start from a blank page
        </button>
        .
      </p>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs rounded-full border px-3 py-1 transition ${
        active
          ? 'border-[#4361EE] bg-[#4361EE]/15 text-white'
          : 'border-[#2a2d3e] bg-[#0f1117] text-[#cbd5e1] hover:border-[#4361EE]/50'
      }`}
    >
      {label}
    </button>
  );
}
