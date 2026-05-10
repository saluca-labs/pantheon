import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  filterMeditationCatalog,
  MEDITATION_CATALOG,
  type MeditationGoalTag,
} from '@/lib/agentic-os/health/meditation-catalog';

/**
 * Medito catalog proxy with static fallback.
 *
 * Tries the Medito API first (best-effort), falls back to the baked-in
 * `MEDITATION_CATALOG` on any non-2xx, network failure, or when no
 * `MEDITO_API_BASE` is configured. The static catalog is the source of
 * truth in Phase 3 — Medito's public endpoints are unstable per the
 * Phase-3 planning doc and probes from this build returned 403/404.
 *
 * Tries (in order):
 *   - `${MEDITO_API_BASE}/sessions`     when env var set
 *   - `https://meditofoundation.org/api/sessions` (one-off probe)
 *
 * The remote shape — when reachable — is normalized into the same shape
 * as the static catalog so the UI doesn't branch.
 */

const MEDITO_PROBE_URLS = [
  process.env.MEDITO_API_BASE
    ? `${process.env.MEDITO_API_BASE.replace(/\/$/, '')}/sessions`
    : null,
  'https://meditofoundation.org/api/sessions',
].filter((u): u is string => typeof u === 'string' && u.length > 0);

interface CatalogEntryShape {
  slug: string;
  title: string;
  description: string;
  durationMin: number;
  tags: string[];
  technique: string;
  source: string;
}

async function tryMeditoApi(): Promise<CatalogEntryShape[] | null> {
  for (const url of MEDITO_PROBE_URLS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = (await res.json()) as unknown;
      if (!json || typeof json !== 'object') continue;
      const items = Array.isArray(json)
        ? json
        : Array.isArray((json as Record<string, unknown>)['sessions'])
          ? ((json as Record<string, unknown>)['sessions'] as unknown[])
          : null;
      if (!items) continue;
      const normalized: CatalogEntryShape[] = [];
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const o = it as Record<string, unknown>;
        const slug = typeof o.slug === 'string' ? o.slug : null;
        const title = typeof o.title === 'string' ? o.title : null;
        if (!slug || !title) continue;
        normalized.push({
          slug,
          title,
          description: typeof o.description === 'string' ? o.description : '',
          durationMin:
            typeof o.durationMin === 'number'
              ? o.durationMin
              : typeof o.duration_min === 'number'
                ? o.duration_min
                : 10,
          tags: Array.isArray(o.tags)
            ? (o.tags.filter((t) => typeof t === 'string') as string[])
            : [],
          technique:
            typeof o.technique === 'string' ? o.technique : 'unknown',
          source: 'medito-foundation',
        });
      }
      if (normalized.length > 0) return normalized;
    } catch {
      // Non-fatal: try the next URL or fall through to the static catalog.
      continue;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // No consent gate — catalog content is the same on every install and
  // does not surface user data.

  const url = new URL(request.url);
  const goalRaw = url.searchParams.get('goal') ?? null;
  const goal: MeditationGoalTag | undefined =
    goalRaw === 'stress' ||
    goalRaw === 'sleep' ||
    goalRaw === 'focus' ||
    goalRaw === 'general'
      ? goalRaw
      : undefined;

  const remote = await tryMeditoApi();
  if (remote) {
    const filtered = goal
      ? remote.filter((e) => e.tags.includes(goal))
      : remote;
    return NextResponse.json({ source: 'medito', catalog: filtered });
  }

  // Fallback (the canonical path in Phase 3).
  const filtered = goal ? filterMeditationCatalog(goal) : MEDITATION_CATALOG;
  return NextResponse.json({ source: 'static', catalog: filtered });
}
