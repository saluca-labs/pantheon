/**
 * Filmmaker OS — Project domain types and pure helpers.
 *
 * Defines the `FilmmakerProject` entity and the `PROJECT_STATUSES` taxonomy.
 * Status values follow industry-standard film production phases:
 *
 *   pre_production → production → post_production → wrapped → archived
 *
 * No database calls here — those live in repo.ts.
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

/**
 * Ordered list of film-production lifecycle statuses.
 *
 * - `pre_production`   — scripting, casting, location scouting
 * - `production`       — principal photography / active filming
 * - `post_production`  — editing, VFX, sound mixing, colour grade
 * - `wrapped`          — finished, delivered or in distribution
 * - `archived`         — retired / shelved
 *
 * References:
 *   https://www.studiobinder.com/blog/pre-production/
 *   https://www.masterclass.com/articles/film-production-stages
 */
export const PROJECT_STATUSES = [
  'pre_production',
  'production',
  'post_production',
  'wrapped',
  'archived',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Human-readable labels for status badges. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  pre_production: 'Pre-Production',
  production: 'Production',
  post_production: 'Post-Production',
  wrapped: 'Wrapped',
  archived: 'Archived',
};

/** A Filmmaker OS project. Maps 1-to-1 with `agos_filmmaker_projects`. */
export interface FilmmakerProject {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** Data required / accepted when creating or updating a project. */
export interface ProjectUpsert {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  tags?: string[];
}

/**
 * Validate that a status value is a known `ProjectStatus`.
 * Returns an error string, or null when the value is valid.
 */
export function validateProjectStatus(value: unknown): string | null {
  if (typeof value !== 'string' || !(PROJECT_STATUSES as readonly string[]).includes(value)) {
    return `Status must be one of: ${PROJECT_STATUSES.join(', ')}.`;
  }
  return null;
}

/**
 * Return a URL-safe project slug derived from the project name.
 * Lowercases, replaces spaces and special characters with hyphens,
 * deduplicates hyphens, and strips leading/trailing hyphens.
 */
export function projectSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
