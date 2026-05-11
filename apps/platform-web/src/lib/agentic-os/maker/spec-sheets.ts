/**
 * Maker OS — Spec sheet domain types and pure helpers.
 *
 * Spec sheets are datasheets, drawings, manuals, and compliance certificates
 * attached to ONE of three owners — a catalog part, a workshop tool, or a
 * project. The polymorphic attachment is enforced at the DB layer by a
 * CHECK constraint on (part_id, tool_id, project_id) summing to 1; this
 * file holds the matching application-layer validators.
 *
 * No database calls here — those live in `repo.ts`.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

// ─── Kind taxonomy ────────────────────────────────────────────────────────

export const SPEC_SHEET_KIND_VALUES = [
  'datasheet',
  'spec',
  'manual',
  'drawing',
  'certificate',
  'other',
] as const;

export type SpecSheetKind = (typeof SPEC_SHEET_KIND_VALUES)[number];

export const SPEC_SHEET_KIND_LABELS: Record<SpecSheetKind, string> = {
  datasheet: 'Datasheet',
  spec: 'Spec',
  manual: 'Manual',
  drawing: 'Drawing',
  certificate: 'Certificate',
  other: 'Other',
};

// ─── Attachment taxonomy ──────────────────────────────────────────────────

export const SPEC_SHEET_ATTACHMENT_VALUES = ['part', 'tool', 'project'] as const;

export type SpecSheetAttachment = (typeof SPEC_SHEET_ATTACHMENT_VALUES)[number];

export const SPEC_SHEET_ATTACHMENT_LABELS: Record<SpecSheetAttachment, string> = {
  part: 'Part',
  tool: 'Tool',
  project: 'Project',
};

// ─── Entity ───────────────────────────────────────────────────────────────

export interface SpecSheet {
  id: string;
  userId: string;
  title: string;
  kind: SpecSheetKind;
  url: string;
  notes: string | null;
  revision: string | null;
  /** YYYY-MM-DD calendar date or null. */
  issuedAt: string | null;
  partId: string | null;
  toolId: string | null;
  projectId: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SpecSheetUpsert {
  title: string;
  kind?: SpecSheetKind;
  url: string;
  notes?: string | null;
  revision?: string | null;
  issuedAt?: string | null;
  partId?: string | null;
  toolId?: string | null;
  projectId?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type SpecSheetPatch = Partial<Omit<SpecSheetUpsert, 'partId' | 'toolId' | 'projectId'>>;

// ─── Validators ───────────────────────────────────────────────────────────

export function validateSpecSheetKind(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(SPEC_SHEET_KIND_VALUES as readonly string[]).includes(value)
  ) {
    return `kind must be one of: ${SPEC_SHEET_KIND_VALUES.join(', ')}.`;
  }
  return null;
}

export function validateSpecSheetTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'title must be a string.';
  const trimmed = value.trim();
  if (!trimmed) return 'title is required.';
  if (trimmed.length > 200) return 'title must be at most 200 characters.';
  return null;
}

export function validateSpecSheetUrl(value: unknown): string | null {
  if (typeof value !== 'string') return 'url must be a string.';
  const trimmed = value.trim();
  if (!trimmed) return 'url is required.';
  if (trimmed.length > 2000) return 'url must be at most 2000 characters.';
  return null;
}

/**
 * Validate the exactly-one-attachment rule (mirrors the DB CHECK constraint).
 * Returns an error string or null. The DB will still enforce this; we do it
 * up-front to give the user a clear 400 response instead of a 500.
 */
export function validateAttachmentExclusivity(input: {
  partId?: string | null;
  toolId?: string | null;
  projectId?: string | null;
}): string | null {
  const count =
    (input.partId ? 1 : 0) +
    (input.toolId ? 1 : 0) +
    (input.projectId ? 1 : 0);
  if (count === 0) {
    return 'Exactly one of partId, toolId, or projectId is required.';
  }
  if (count > 1) {
    return 'Exactly one of partId, toolId, or projectId may be set, not more.';
  }
  return null;
}

/**
 * Validate issuedAt — must be either null or a YYYY-MM-DD calendar date.
 * Returns an error string or null.
 */
export function validateIssuedAt(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    return 'issuedAt must be a YYYY-MM-DD string or null.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'issuedAt must match YYYY-MM-DD.';
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) {
    return 'issuedAt is not a real calendar date.';
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Group spec sheets by their attachment kind. Pure — used by the project
 * Specs tab to render a section per attachment type.
 */
export interface SpecSheetGroups {
  part: SpecSheet[];
  tool: SpecSheet[];
  project: SpecSheet[];
}

export function groupSpecSheetsByAttachment(sheets: SpecSheet[]): SpecSheetGroups {
  const out: SpecSheetGroups = { part: [], tool: [], project: [] };
  for (const s of sheets) {
    if (s.partId) out.part.push(s);
    else if (s.toolId) out.tool.push(s);
    else if (s.projectId) out.project.push(s);
  }
  return out;
}

/**
 * Determine the attachment kind of a spec sheet from its FK columns. Pure.
 */
export function specSheetAttachment(sheet: SpecSheet): SpecSheetAttachment | null {
  if (sheet.partId) return 'part';
  if (sheet.toolId) return 'tool';
  if (sheet.projectId) return 'project';
  return null;
}
