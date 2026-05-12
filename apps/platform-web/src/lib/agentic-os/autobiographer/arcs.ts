/**
 * Autobiographer OS — Arc domain types and pure helpers.
 *
 * Arcs are per-book chapter orderings. Each book may have any number of
 * arcs (chronological, thematic, character-led, custom); at most one is
 * marked `is_primary`, which becomes the default chapter ordering for
 * the book detail page and the book PDF export.
 *
 * @license MIT — original work for Tiresias platform
 */

export const ARC_KINDS = [
  'chronological',
  'thematic',
  'character_led',
  'custom',
] as const;

export type ArcKind = (typeof ARC_KINDS)[number];

export const ARC_KIND_LABELS: Record<ArcKind, string> = {
  chronological: 'Chronological',
  thematic: 'Thematic',
  character_led: 'Character-led',
  custom: 'Custom',
};

export const ARC_TITLE_MAX = 255;
export const ARC_DESCRIPTION_MAX = 4_000;

export function validateArcTitle(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Arc title is required.';
  }
  if (value.length > ARC_TITLE_MAX) {
    return `Arc title must be ${ARC_TITLE_MAX} characters or fewer.`;
  }
  return null;
}

export function validateArcKind(value: unknown): string | null {
  if (typeof value !== 'string' || !(ARC_KINDS as readonly string[]).includes(value)) {
    return `Arc kind must be one of: ${ARC_KINDS.join(', ')}.`;
  }
  return null;
}

export function validateArcDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'Description must be a string.';
  if (value.length > ARC_DESCRIPTION_MAX) {
    return `Description must be ${ARC_DESCRIPTION_MAX} characters or fewer.`;
  }
  return null;
}
