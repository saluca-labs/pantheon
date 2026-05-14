'use client';

import { useState, useTransition } from 'react';
import type { AgenticOsModule } from '@/lib/agentic-os/registry';

interface FlagsToggleListProps {
  modules: AgenticOsModule[];
  initialFlags: Record<string, boolean>;
}

/**
 * Client component — renders one toggle row per Agentic OS module.
 *
 * Uses a plain <button role="switch"> for accessibility; no switch library
 * is introduced (per licence + constraint rules).
 *
 * Toggling sends a PUT to /api/tiresias/agentic-os/flags and optimistically
 * updates the UI. On error the optimistic update is rolled back.
 */
export function FlagsToggleList({ modules, initialFlags }: FlagsToggleListProps) {
  const [flags, setFlags] = useState<Record<string, boolean>>(initialFlags);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle(slug: string) {
    const nextEnabled = !flags[slug];
    // Optimistic update
    setFlags((prev) => ({ ...prev, [slug]: nextEnabled }));
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch('/api/tiresias/agentic-os/flags', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, enabled: nextEnabled }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const { flags: updated } = (await res.json()) as { flags: Record<string, boolean> };
        setFlags(updated);
      } catch (err) {
        // Roll back optimistic update
        setFlags((prev) => ({ ...prev, [slug]: !nextEnabled }));
        setError(err instanceof Error ? err.message : 'Failed to update flag');
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Persistent note */}
      <div className="rounded-lg border border-border-subtle bg-surface-0 px-4 py-3 text-sm text-text-secondary">
        Disabling an OS hides it from your dashboard. Your data is preserved.
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border-subtle bg-surface-2 divide-y divide-border-subtle">
        {modules.map((mod) => {
          const Icon = mod.icon;
          const enabled = flags[mod.slug] !== false;

          return (
            <div
              key={mod.slug}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`rounded-lg bg-surface-0 p-2 border border-border-subtle shrink-0 ${!enabled ? 'opacity-40' : ''}`}>
                  <Icon className="w-4 h-4 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${enabled ? 'text-white' : 'text-text-secondary'}`}>
                    {mod.label}
                  </p>
                  <p className="text-xs text-text-secondary/70 truncate">{mod.tagline}</p>
                </div>
              </div>

              <button
                role="switch"
                aria-checked={enabled}
                aria-label={`Toggle ${mod.label}`}
                disabled={pending}
                onClick={() => toggle(mod.slug)}
                className={`
                  relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                  transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2
                  focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${enabled ? 'bg-accent' : 'bg-border-subtle'}
                `}
              >
                <span
                  aria-hidden="true"
                  className={`
                    pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg
                    transform ring-0 transition duration-200 ease-in-out
                    ${enabled ? 'translate-x-5' : 'translate-x-0'}
                  `}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
