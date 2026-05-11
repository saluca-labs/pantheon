/**
 * Filmmaker OS — Character + relationship domain types and helpers.
 *
 * No database calls here — those live in repo.ts. The taxonomy constants
 * (`CHARACTER_ROLES`, `RELATIONSHIP_KINDS`, `RELATIONSHIP_DIRECTIONS`)
 * are the single source of truth for both UI rendering and Zod schemas.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

// ─── Roles ───────────────────────────────────────────────────────────────────

export const CHARACTER_ROLE_VALUES = [
  'protagonist',
  'antagonist',
  'deuteragonist',
  'supporting',
  'minor',
  'ensemble',
] as const;

export type CharacterRole = (typeof CHARACTER_ROLE_VALUES)[number];

export interface CharacterRoleInfo {
  role: CharacterRole;
  label: string;
  description: string;
}

export const CHARACTER_ROLES: CharacterRoleInfo[] = [
  {
    role: 'protagonist',
    label: 'Protagonist',
    description: 'Primary point-of-view character driving the central want.',
  },
  {
    role: 'antagonist',
    label: 'Antagonist',
    description: 'Force in opposition to the protagonist.',
  },
  {
    role: 'deuteragonist',
    label: 'Deuteragonist',
    description: 'Secondary lead — sidekick, partner, or rival lead.',
  },
  {
    role: 'supporting',
    label: 'Supporting',
    description: 'Named role with significant scene presence.',
  },
  {
    role: 'minor',
    label: 'Minor',
    description: 'Named role with limited scene presence.',
  },
  {
    role: 'ensemble',
    label: 'Ensemble',
    description: 'One of multiple roughly co-equal leads.',
  },
];

export const CHARACTER_ROLE_LABEL: Record<CharacterRole, string> =
  Object.fromEntries(CHARACTER_ROLES.map((r) => [r.role, r.label])) as Record<
    CharacterRole,
    string
  >;

// ─── Relationships ───────────────────────────────────────────────────────────

export const RELATIONSHIP_KIND_VALUES = [
  'ally',
  'rival',
  'family',
  'romantic',
  'mentor_to',
  'student_of',
  'colleague',
  'enemy',
  'estranged',
  'other',
] as const;

export type RelationshipKind = (typeof RELATIONSHIP_KIND_VALUES)[number];

export interface RelationshipKindInfo {
  kind: RelationshipKind;
  label: string;
  /** True when the relationship is naturally asymmetric (default direction = directional). */
  asymmetric: boolean;
}

export const RELATIONSHIP_KINDS: RelationshipKindInfo[] = [
  { kind: 'ally', label: 'Ally', asymmetric: false },
  { kind: 'rival', label: 'Rival', asymmetric: false },
  { kind: 'family', label: 'Family', asymmetric: false },
  { kind: 'romantic', label: 'Romantic', asymmetric: false },
  { kind: 'mentor_to', label: 'Mentor to', asymmetric: true },
  { kind: 'student_of', label: 'Student of', asymmetric: true },
  { kind: 'colleague', label: 'Colleague', asymmetric: false },
  { kind: 'enemy', label: 'Enemy', asymmetric: false },
  { kind: 'estranged', label: 'Estranged', asymmetric: false },
  { kind: 'other', label: 'Other', asymmetric: false },
];

export const RELATIONSHIP_KIND_LABEL: Record<RelationshipKind, string> =
  Object.fromEntries(RELATIONSHIP_KINDS.map((k) => [k.kind, k.label])) as Record<
    RelationshipKind,
    string
  >;

export const RELATIONSHIP_DIRECTION_VALUES = ['directional', 'mutual'] as const;
export type RelationshipDirection = (typeof RELATIONSHIP_DIRECTION_VALUES)[number];

export interface RelationshipDirectionInfo {
  direction: RelationshipDirection;
  label: string;
  description: string;
}

export const RELATIONSHIP_DIRECTIONS: RelationshipDirectionInfo[] = [
  {
    direction: 'mutual',
    label: 'Mutual',
    description: 'Symmetric — both characters experience the relationship.',
  },
  {
    direction: 'directional',
    label: 'Directional',
    description: 'Asymmetric — from → to only.',
  },
];

// ─── Entities ────────────────────────────────────────────────────────────────

export interface Character {
  id: string;
  projectId: string;
  name: string;
  role: CharacterRole;
  archetype: string | null;
  logline: string | null;
  age: string | null;
  pronouns: string | null;
  gender: string | null;
  occupation: string | null;
  backstory: string | null;
  goals: string | null;
  needs: string | null;
  fears: string | null;
  wounds: string | null;
  arc: string | null;
  voiceNotes: string | null;
  physicalDescription: string | null;
  portraitUrl: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterUpsert {
  name: string;
  role?: CharacterRole;
  archetype?: string | null;
  logline?: string | null;
  age?: string | null;
  pronouns?: string | null;
  gender?: string | null;
  occupation?: string | null;
  backstory?: string | null;
  goals?: string | null;
  needs?: string | null;
  fears?: string | null;
  wounds?: string | null;
  arc?: string | null;
  voiceNotes?: string | null;
  physicalDescription?: string | null;
  portraitUrl?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CharacterRelationship {
  id: string;
  projectId: string;
  fromId: string;
  toId: string;
  kind: RelationshipKind;
  direction: RelationshipDirection;
  description: string | null;
  tension: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterRelationshipUpsert {
  fromId: string;
  toId: string;
  kind?: RelationshipKind;
  direction?: RelationshipDirection;
  description?: string | null;
  tension?: number | null;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Required: name (non-empty). Optional fields are not validated for
 * content — the server stores whatever the user supplies. Role, if
 * present, must be a known role.
 */
export function validateCharacter(
  input: Partial<CharacterUpsert>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required.' });
  }
  if (
    input.role !== undefined &&
    !(CHARACTER_ROLE_VALUES as readonly string[]).includes(input.role)
  ) {
    errors.push({
      field: 'role',
      message: `Role must be one of: ${CHARACTER_ROLE_VALUES.join(', ')}.`,
    });
  }
  return errors;
}

// ─── Mutual-pair dedup ───────────────────────────────────────────────────────

/**
 * Collapse mutual-direction relationships down to one row per
 * unordered pair. Directional relationships pass through. Stable: the
 * first occurrence in input order is the one retained. Used for
 * display + export so a friendship doesn't show twice.
 */
export function dedupeMutualRelationships(
  rels: CharacterRelationship[],
): CharacterRelationship[] {
  const seen = new Set<string>();
  const out: CharacterRelationship[] = [];
  for (const r of rels) {
    if (r.direction === 'directional') {
      out.push(r);
      continue;
    }
    const [a, b] = r.fromId < r.toId ? [r.fromId, r.toId] : [r.toId, r.fromId];
    const key = `${r.kind}:${a}:${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

/**
 * Terse single-line summary for AI coach context, lists, and tooltips.
 * Skips fields the user hasn't filled. Always starts with `name —
 * role` so the caller can string-match.
 */
export function summarizeCharacter(c: Character): string {
  const parts: string[] = [];
  parts.push(`${c.name} — ${CHARACTER_ROLE_LABEL[c.role].toLowerCase()}`);

  const bracket: string[] = [];
  if (c.age) bracket.push(c.age);
  if (c.occupation) bracket.push(c.occupation);
  if (bracket.length > 0) parts[0] += ` (${bracket.join(', ')})`;

  if (c.goals) parts.push(`Goal: ${c.goals.trim()}`);
  if (c.needs) parts.push(`Need: ${c.needs.trim()}`);

  return parts.join(', ') + '.';
}
