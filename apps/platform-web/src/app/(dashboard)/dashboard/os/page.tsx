/**
 * Agentic OS index — /dashboard/os
 *
 * Server component (App Router default). Renders all 9 OS module cards with
 * live per-OS counts fetched directly from the shared summary helper — no
 * HTTP round-trip needed in a server component.
 *
 * Each card shows:
 *   - OS icon + label
 *   - Status pill (live / preview / planned)
 *   - Count badge (e.g. "12 builds")
 *   - Last updated relative time ("3 days ago")
 *   - Tagline
 *
 * If the summary query errored for a slug, the count shows "—" with a warning indicator.
 *
 * @license MIT — Tiresias platform (internal).
 */

import Link from 'next/link';
import { Cpu } from 'lucide-react';
import { Suspense } from 'react';
import { AGENTIC_OS_MODULES } from '@/lib/agentic-os/registry';
import type { AgenticOsModule } from '@/lib/agentic-os/registry';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { getOsSummary } from '@/app/api/tiresias/agentic-os/summary/route';
import type { OsSummaryEntry } from '@/app/api/tiresias/agentic-os/summary/route';

// ─── Relative time formatter ──────────────────────────────────────────────────

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.parse(iso) - Date.now();
  const absDiff = Math.abs(diff);

  if (absDiff < 60_000) return 'Just now';
  if (absDiff < 3_600_000) return rtf.format(-Math.round(absDiff / 60_000), 'minute');
  if (absDiff < 86_400_000) return rtf.format(-Math.round(absDiff / 3_600_000), 'hour');
  if (absDiff < 2_592_000_000) return rtf.format(-Math.round(absDiff / 86_400_000), 'day');
  if (absDiff < 31_536_000_000) return rtf.format(-Math.round(absDiff / 2_592_000_000), 'month');
  return rtf.format(-Math.round(absDiff / 31_536_000_000), 'year');
}

// ─── Count badge label per slug ───────────────────────────────────────────────

const COUNT_LABEL: Record<string, (n: number) => string> = {
  health:         (n) => n === 1 ? '1 profile' : `${n} profiles`,
  maker:          (n) => n === 1 ? '1 build' : `${n} builds`,
  research:       (n) => n === 1 ? '1 hypothesis' : `${n} hypotheses`,
  'secure-dev':   (n) => n === 1 ? '1 model' : `${n} models`,
  cyber:          (n) => n === 1 ? '1 alert' : `${n} alerts`,
  filmmaker:      (n) => n === 1 ? '1 project' : `${n} projects`,
  autobiographer: (n) => n === 1 ? '1 chapter' : `${n} chapters`,
  business:       (n) => n === 1 ? '1 contact' : `${n} contacts`,
  creator:        (n) => n === 1 ? '1 post' : `${n} posts`,
};

function countLabel(slug: string, count: number): string {
  const fn = COUNT_LABEL[slug];
  return fn ? fn(count) : `${count} items`;
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  live: {
    label: 'Live',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  preview: {
    label: 'Preview',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  planned: {
    label: 'Planned',
    className: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  },
};

// ─── Card skeleton (shown while summary loads) ────────────────────────────────

function CardSkeleton({ mod }: { mod: AgenticOsModule }) {
  const Icon = mod.icon;
  const badge = STATUS_BADGE[mod.status] ?? STATUS_BADGE['planned']!;
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-surface-0 p-2 border border-border-subtle">
            <Icon className="w-5 h-5 text-accent" />
          </div>
          <h2 className="text-white font-semibold">{mod.label}</h2>
        </div>
        <span
          className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      <p className="text-sm text-text-secondary mb-3">{mod.tagline}</p>
      <div className="flex items-center gap-2">
        <div className="h-5 w-16 rounded-full bg-border-subtle animate-pulse" />
        <div className="h-4 w-20 rounded bg-border-subtle animate-pulse" />
      </div>
    </div>
  );
}

// ─── Live card (with summary data) ───────────────────────────────────────────

function OsCard({
  mod,
  entry,
}: {
  mod: AgenticOsModule;
  entry: OsSummaryEntry | undefined;
}) {
  const Icon = mod.icon;
  const badge = STATUS_BADGE[mod.status] ?? STATUS_BADGE['planned']!;
  const hasError = entry?.error != null;
  const countText = entry && !hasError ? countLabel(mod.slug, entry.count) : '—';
  const lastText = entry && !hasError ? relativeTime(entry.lastUpdated) : null;

  return (
    <Link
      href={`/dashboard/os/${mod.slug}`}
      className="group rounded-xl border border-border-subtle bg-surface-2 p-5 transition hover:border-accent/60 hover:bg-surface-3 block"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-surface-0 p-2 border border-border-subtle">
            <Icon className="w-5 h-5 text-accent" />
          </div>
          <h2 className="text-white font-semibold group-hover:text-accent transition">
            {mod.label}
          </h2>
        </div>
        <span
          className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <p className="text-sm text-text-secondary mb-3">{mod.tagline}</p>

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${
            hasError
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
              : 'bg-accent/10 text-accent border-accent/20'
          }`}
          title={hasError ? `Query error: ${entry?.error}` : undefined}
        >
          {hasError && <span aria-label="Error">&#x26A0;</span>}
          {countText}
        </span>

        {lastText && (
          <span className="text-xs text-text-secondary/70">{lastText}</span>
        )}
      </div>
    </Link>
  );
}

// ─── Cards grid with summary data ─────────────────────────────────────────────

async function OsCardGrid() {
  const user = await getCurrentMakerUser();
  if (!user) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AGENTIC_OS_MODULES.map((mod) => (
          <CardSkeleton key={mod.slug} mod={mod} />
        ))}
      </div>
    );
  }

  const summary = await getOsSummary(user.userId);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {AGENTIC_OS_MODULES.map((mod) => (
        <OsCard key={mod.slug} mod={mod} entry={summary[mod.slug]} />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgenticOsIndexPage() {
  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-3 mb-2">
        <Cpu className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">Agentic OS</h1>
      </div>
      <p className="text-text-secondary mb-8">
        Vertical operating systems for life and work — each with its own data
        model, plan generator, and citation-backed agent loop.
      </p>

      <Suspense
        fallback={
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTIC_OS_MODULES.map((mod) => (
              <CardSkeleton key={mod.slug} mod={mod} />
            ))}
          </div>
        }
      >
        <OsCardGrid />
      </Suspense>
    </div>
  );
}
