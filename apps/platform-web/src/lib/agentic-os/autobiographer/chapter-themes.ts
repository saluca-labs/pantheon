/**
 * Autobiographer OS — Chapter-theme join domain helpers.
 *
 * Mirror of `memory-themes.ts`; thin PK-only join with no extra
 * relational data. The route layer rejects cross-tenant operations via
 * the repo's typed `not_found` error.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

export interface ChapterThemeLinkInput {
  themeId: string;
}
