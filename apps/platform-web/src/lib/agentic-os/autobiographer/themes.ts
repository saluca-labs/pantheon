/**
 * Autobiographer OS — Theme domain types and pure helpers.
 *
 * Themes are workshop-global tags applied to memories and chapters in
 * Phase 5. They surface in the timeline filters, the memory + chapter
 * edit pages, and the per-book timeline view. Slug uniqueness is
 * per-user (case-sensitive); a parallel functional index keeps the
 * canonical name case-insensitively unique per user (mirrors the
 * people-table pattern).
 *
 * Phase 6 seam: ``sensitivity`` will be added to themes as an enum
 * (``public`` / ``private`` / ``redacted``) for the publication gate.
 * Phase 5 routes use Zod ``.strict()`` so an unknown ``sensitivity``
 * field is rejected at the API boundary today.
 *
 * @license MIT — original work for Tiresias platform
 */

export const THEME_NAME_MAX = 120;
export const THEME_SLUG_MAX = 120;
export const THEME_DESCRIPTION_MAX = 4_000;
export const THEME_COLOR_MAX = 32;

/**
 * Accepted color tokens for theme chips. Free-form Tailwind accent names
 * are allowed at the API surface (no enum CHECK in the DB) so a future
 * design pass can introduce new accents without a migration; this list
 * is the Phase 5 picker default palette.
 */
export const THEME_COLOR_TOKENS = [
  'indigo',
  'teal',
  'rose',
  'amber',
  'emerald',
  'sky',
  'violet',
  'fuchsia',
  'slate',
  'orange',
] as const;
export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];

/**
 * URL-safe slug derived from a theme name. Lowercase, dash-joined,
 * trimmed. Empty strings collapse to '' so callers can fall back to a
 * deterministic placeholder.
 */
export function themeSlug(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, THEME_SLUG_MAX);
}

export function validateThemeName(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Theme name is required.';
  }
  if (value.length > THEME_NAME_MAX) {
    return `Theme name must be ${THEME_NAME_MAX} characters or fewer.`;
  }
  return null;
}

export function validateThemeSlug(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'Slug must be a string.';
  if (value.length === 0) return 'Slug must be at least one character.';
  if (value.length > THEME_SLUG_MAX) {
    return `Slug must be ${THEME_SLUG_MAX} characters or fewer.`;
  }
  if (!/^[a-z0-9-]+$/.test(value)) {
    return 'Slug must be lowercase alphanumeric with dashes only.';
  }
  return null;
}

export function validateThemeDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'Description must be a string.';
  if (value.length > THEME_DESCRIPTION_MAX) {
    return `Description must be ${THEME_DESCRIPTION_MAX} characters or fewer.`;
  }
  return null;
}

export function validateThemeColor(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'Color must be a string.';
  if (value.length > THEME_COLOR_MAX) {
    return `Color must be ${THEME_COLOR_MAX} characters or fewer.`;
  }
  if (!/^[a-z][a-z0-9_-]*$/i.test(value)) {
    return 'Color must be a kebab/snake/camel token.';
  }
  return null;
}
