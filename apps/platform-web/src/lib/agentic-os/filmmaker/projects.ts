/**
 * Filmmaker OS — Project domain types and pure helpers.
 *
 * Defines the `FilmmakerProject` entity and the production taxonomies the
 * Project Hub renders. No database calls here — those live in repo.ts.
 *
 * References:
 *   - StudioBinder "Pre-Production Ultimate Guide":
 *     https://www.studiobinder.com/blog/pre-production/
 *   - Production phase taxonomy adapted from:
 *     https://www.masterclass.com/articles/film-production-stages
 *     (MasterClass, public-domain reference)
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

// ─── Status taxonomy (production phase) ──────────────────────────────────────

/**
 * Ordered list of film-production lifecycle statuses.
 *
 * - `pre_production`   — scripting, casting, location scouting
 * - `production`       — principal photography / active filming
 * - `post_production`  — editing, VFX, sound mixing, colour grade
 * - `wrapped`          — finished, delivered or in distribution
 * - `archived`         — retired / shelved
 */
export const PROJECT_STATUSES = [
  'pre_production',
  'production',
  'post_production',
  'wrapped',
  'archived',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  pre_production: 'Pre-Production',
  production: 'Production',
  post_production: 'Post-Production',
  wrapped: 'Wrapped',
  archived: 'Archived',
};

// ─── Format taxonomy ─────────────────────────────────────────────────────────

/**
 * Production format. Drives marketing copy, expected runtime, and which
 * downstream Phase 2-7 features apply (e.g. episode-pacing for `tv`).
 */
export const FORMATS = [
  'feature',
  'short',
  'tv',
  'pilot',
  'webseries',
  'documentary',
  'music_video',
  'commercial',
] as const;

export type ProjectFormat = (typeof FORMATS)[number];

export const FORMAT_LABELS: Record<ProjectFormat, string> = {
  feature: 'Feature',
  short: 'Short',
  tv: 'TV Series',
  pilot: 'Pilot',
  webseries: 'Web Series',
  documentary: 'Documentary',
  music_video: 'Music Video',
  commercial: 'Commercial',
};

// ─── Phase progress ──────────────────────────────────────────────────────────

/**
 * Per-phase completion percentage. Stored as a single JSONB column so
 * adding/removing phases later does not require a schema migration.
 */
export interface PhaseProgress {
  development: number;
  pre_production: number;
  production: number;
  post_production: number;
  distribution: number;
}

export const PHASE_KEYS = [
  'development',
  'pre_production',
  'production',
  'post_production',
  'distribution',
] as const;

export type PhaseKey = (typeof PHASE_KEYS)[number];

export const PHASE_LABELS: Record<PhaseKey, string> = {
  development: 'Development',
  pre_production: 'Pre-Production',
  production: 'Production',
  post_production: 'Post-Production',
  distribution: 'Distribution',
};

export function phaseProgressDefault(): PhaseProgress {
  return {
    development: 0,
    pre_production: 0,
    production: 0,
    post_production: 0,
    distribution: 0,
  };
}

/** Normalize an arbitrary JSON value into a complete PhaseProgress. */
export function coercePhaseProgress(value: unknown): PhaseProgress {
  const out = phaseProgressDefault();
  if (!value || typeof value !== 'object') return out;
  const v = value as Record<string, unknown>;
  for (const key of PHASE_KEYS) {
    const raw = v[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      out[key] = Math.max(0, Math.min(100, Math.round(raw)));
    }
  }
  return out;
}

// ─── Project entity ──────────────────────────────────────────────────────────

export interface FilmmakerProject {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  tags: string[];
  format: ProjectFormat;
  logline: string | null;
  coverImageUrl: string | null;
  phaseProgress: PhaseProgress;
  targetCompletionDate: string | null;
  teamSize: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectUpsert {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  tags?: string[];
  format?: ProjectFormat;
  logline?: string | null;
  coverImageUrl?: string | null;
  phaseProgress?: PhaseProgress;
  targetCompletionDate?: string | null;
  teamSize?: number | null;
  metadata?: Record<string, unknown>;
}

// ─── Validators ──────────────────────────────────────────────────────────────

export function validateProjectStatus(value: unknown): string | null {
  if (typeof value !== 'string' || !(PROJECT_STATUSES as readonly string[]).includes(value)) {
    return `Status must be one of: ${PROJECT_STATUSES.join(', ')}.`;
  }
  return null;
}

export function validateProjectFormat(value: unknown): string | null {
  if (typeof value !== 'string' || !(FORMATS as readonly string[]).includes(value)) {
    return `Format must be one of: ${FORMATS.join(', ')}.`;
  }
  return null;
}

/**
 * Return a URL-safe project slug derived from the project name.
 */
export function projectSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
