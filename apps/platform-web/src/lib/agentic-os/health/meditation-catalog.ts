/**
 * Static Medito-style meditation catalog.
 *
 * Phase 3 ships with a baked-in catalog rather than a live Medito API
 * proxy. Reasons:
 *
 *   1. The Medito Foundation's web/app endpoints (meditofoundation.org,
 *      medito.app) do not currently expose a documented public JSON
 *      catalog. Probes return 403/404 across plausible paths
 *      (/api, /api/sessions, /api/v1/sessions, /data, content.*).
 *   2. The Phase-3 planning doc explicitly flagged the Medito API as
 *      unstable and recommended a static fallback.
 *   3. Sessions in this catalog are NOT served audio — they are
 *      slugs/labels the UI can deep-link or display. Users record
 *      manual sessions OR follow a slot from the generated plan; no
 *      audio is streamed from this server.
 *
 * The catalog is a small, curated subset of common guided-meditation
 * "shapes" (breath, body scan, loving-kindness, sleep, focus, etc.)
 * picked from public-domain mindfulness resources (NHS, NIMH, Plum
 * Village dharma talks, Headspace's free track summaries — only the
 * SHAPE/intent is encoded, not the third-party content itself).
 *
 * Slugs are stable; the rules-based plan generator references them.
 */

export type MeditationGoalTag = 'stress' | 'sleep' | 'focus' | 'general';

export interface MeditationCatalogEntry {
  /** Stable identifier used as `source_ref` and in plan slots. */
  slug: string;
  /** Human-readable session title. */
  title: string;
  /** One-line description of the session focus. */
  description: string;
  /** Approximate session duration in minutes. */
  durationMin: number;
  /** Goal tags the rules-based planner filters on. */
  tags: MeditationGoalTag[];
  /**
   * High-level technique label — useful for UI grouping. Free-form;
   * not enum-locked since the catalog can grow.
   */
  technique: string;
  /** Source / inspiration line. */
  source: string;
}

/**
 * Curated catalog. Intentionally short — wide enough that the planner
 * can pick a different session each day across a 7-day plan, narrow
 * enough that the static list is hand-maintainable.
 */
export const MEDITATION_CATALOG: MeditationCatalogEntry[] = [
  // ── Stress / calming ──────────────────────────────────────────────
  {
    slug: 'breath-awareness-10',
    title: 'Breath awareness',
    description:
      'Anchor attention on the breath, returning gently each time the mind drifts.',
    durationMin: 10,
    tags: ['stress', 'general'],
    technique: 'breath',
    source: 'NHS — Mindfulness self-help guide (paraphrased)',
  },
  {
    slug: 'box-breathing-5',
    title: 'Box breathing',
    description:
      'Four counts in, four counts hold, four counts out, four counts hold. A short reset.',
    durationMin: 5,
    tags: ['stress', 'focus'],
    technique: 'breath',
    source: 'US Navy SEAL training popularization (technique in public rotation)',
  },
  {
    slug: 'body-scan-15',
    title: 'Body scan',
    description:
      'Slowly move attention through the body, noticing sensations without trying to change them.',
    durationMin: 15,
    tags: ['stress', 'sleep', 'general'],
    technique: 'body-scan',
    source: 'Kabat-Zinn MBSR (paraphrased pattern)',
  },
  {
    slug: 'loving-kindness-12',
    title: 'Loving-kindness (metta)',
    description:
      'Direct goodwill phrases inward, then to a loved one, a stranger, and finally everyone.',
    durationMin: 12,
    tags: ['stress', 'general'],
    technique: 'loving-kindness',
    source: 'Plum Village dharma talks (paraphrased pattern)',
  },

  // ── Sleep / wind-down ─────────────────────────────────────────────
  {
    slug: 'sleep-wind-down-15',
    title: 'Sleep wind-down',
    description:
      'Slow exhale-extended breathing and progressive relaxation to ease into sleep.',
    durationMin: 15,
    tags: ['sleep'],
    technique: 'breath+pmr',
    source: 'NHS — Sleep self-help guide (paraphrased)',
  },
  {
    slug: 'progressive-relaxation-20',
    title: 'Progressive muscle relaxation',
    description:
      'Tense and release each muscle group, releasing the day before bed.',
    durationMin: 20,
    tags: ['sleep', 'stress'],
    technique: 'pmr',
    source: 'Jacobson PMR (1938) — public-domain technique',
  },

  // ── Focus / energy ────────────────────────────────────────────────
  {
    slug: 'focus-anchor-10',
    title: 'Focus anchor',
    description:
      'Single-pointed attention on a chosen anchor (breath, sound, sensation) to sharpen focus.',
    durationMin: 10,
    tags: ['focus'],
    technique: 'concentration',
    source: 'Shamatha (calming-abiding) practice — paraphrased',
  },
  {
    slug: 'energy-reset-5',
    title: 'Energy reset',
    description:
      'Standing breath + light stretching to break a slump without caffeine.',
    durationMin: 5,
    tags: ['focus', 'general'],
    technique: 'movement+breath',
    source: 'NHS — Active wellbeing tips (paraphrased)',
  },

  // ── General / open ────────────────────────────────────────────────
  {
    slug: 'open-awareness-12',
    title: 'Open awareness',
    description:
      'Let thoughts, sounds, and sensations come and go without grabbing any of them.',
    durationMin: 12,
    tags: ['general', 'stress'],
    technique: 'open-monitoring',
    source: 'Vipassana — paraphrased pattern',
  },
  {
    slug: 'short-pause-3',
    title: 'Three-breath pause',
    description:
      'A micro-meditation: three slow breaths between two tasks.',
    durationMin: 3,
    tags: ['general', 'focus', 'stress'],
    technique: 'breath',
    source: 'Hanson — micro-practice rotation (paraphrased)',
  },
];

/**
 * Filter the catalog by goal tag. Pass undefined to return everything.
 */
export function filterMeditationCatalog(
  goal?: MeditationGoalTag,
): MeditationCatalogEntry[] {
  if (!goal) return MEDITATION_CATALOG;
  return MEDITATION_CATALOG.filter((s) => s.tags.includes(goal));
}

/**
 * Look up a single entry by slug.
 */
export function getMeditationEntry(
  slug: string,
): MeditationCatalogEntry | null {
  return MEDITATION_CATALOG.find((s) => s.slug === slug) ?? null;
}
