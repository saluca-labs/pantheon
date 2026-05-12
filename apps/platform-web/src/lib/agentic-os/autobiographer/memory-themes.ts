/**
 * Autobiographer OS — Memory-theme join domain helpers.
 *
 * The join is a thin PK-only relation (no role / weight / notes columns
 * in Phase 5); this file exists for symmetry with `memory-people.ts` and
 * for the typed `ThemeLinkInput` the route layer consumes.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

export interface ThemeLinkInput {
  themeId: string;
}
