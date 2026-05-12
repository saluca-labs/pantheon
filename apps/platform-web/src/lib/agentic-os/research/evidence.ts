/**
 * Research OS Phase 3 — hypothesis-evidence domain types.
 *
 * Evidence is the linkage between a hypothesis and a supporting,
 * refuting, or mixed-signal source. Single polymorphic table on the
 * DB side — discriminated by `source_kind`:
 *
 *   - `notebook_entry` — link to an agos_research_notebook_entries row.
 *                        `sourceId` carries the entry id.
 *   - `paper`          — Phase 4 literature library row.
 *                        `sourceId` carries the paper id.
 *   - `dataset`        — Phase 5 dataset row.
 *                        `sourceId` carries the dataset id.
 *   - `external_url`   — arbitrary external URL.
 *                        `sourceUrl` carries the URL; `sourceId` null.
 *   - `free_text`      — pure prose; no link.
 *                        Both `sourceId` and `sourceUrl` are null;
 *                        `notes` must be non-empty.
 *
 * Validation contract (enforced at the route layer):
 *   - `external_url`            => `sourceUrl` required, non-empty
 *   - `notebook_entry`/`paper`
 *     /`dataset`                => `sourceId` required
 *   - `free_text`               => `notes` required, non-empty
 *
 * Evidence is append-or-delete only — there is no PATCH on
 * individual rows. Re-linking means delete + recreate.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

export const EVIDENCE_POLARITIES = ['supports', 'refutes', 'mixed'] as const;
export type EvidencePolarity = (typeof EVIDENCE_POLARITIES)[number];

export const EVIDENCE_POLARITY_LABELS: Record<EvidencePolarity, string> = {
  supports: 'Supports',
  refutes: 'Refutes',
  mixed: 'Mixed',
};

export const EVIDENCE_SOURCE_KINDS = [
  'notebook_entry',
  'paper',
  'dataset',
  'external_url',
  'free_text',
] as const;
export type EvidenceSourceKind = (typeof EVIDENCE_SOURCE_KINDS)[number];

export const EVIDENCE_SOURCE_KIND_LABELS: Record<EvidenceSourceKind, string> = {
  notebook_entry: 'Notebook entry',
  paper: 'Paper',
  dataset: 'Dataset',
  external_url: 'External URL',
  free_text: 'Free text',
};

/**
 * Lucide icon NAME (not component) per source_kind. Keeps the lib layer
 * free of React imports — components resolve to the actual component
 * via a local switch.
 */
export const EVIDENCE_SOURCE_KIND_ICON: Record<EvidenceSourceKind, string> = {
  notebook_entry: 'BookOpen',
  paper: 'FileText',
  dataset: 'Database',
  external_url: 'Link',
  free_text: 'AlignLeft',
};

export interface Evidence {
  id: string;
  hypothesisId: string;
  userId: string;
  polarity: EvidencePolarity;
  sourceKind: EvidenceSourceKind;
  sourceId: string | null;
  sourceUrl: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateEvidenceInput {
  polarity: EvidencePolarity;
  sourceKind: EvidenceSourceKind;
  sourceId?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

/** Type guard — returns the typed polarity or null. */
export function asEvidencePolarity(value: unknown): EvidencePolarity | null {
  if (typeof value !== 'string') return null;
  return (EVIDENCE_POLARITIES as readonly string[]).includes(value)
    ? (value as EvidencePolarity)
    : null;
}

/** Type guard — returns the typed source kind or null. */
export function asEvidenceSourceKind(value: unknown): EvidenceSourceKind | null {
  if (typeof value !== 'string') return null;
  return (EVIDENCE_SOURCE_KINDS as readonly string[]).includes(value)
    ? (value as EvidenceSourceKind)
    : null;
}

/**
 * Validate a CreateEvidenceInput against the source-kind discriminator
 * contract. Returns an array of error messages — empty means valid.
 * Centralized here so both the route layer and any future server-side
 * call sites use the same check.
 */
export function validateEvidenceInput(input: {
  polarity: unknown;
  sourceKind: unknown;
  sourceId?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
}): string[] {
  const errors: string[] = [];
  const polarity = asEvidencePolarity(input.polarity);
  if (!polarity) {
    errors.push(`Invalid polarity: must be one of ${EVIDENCE_POLARITIES.join(', ')}.`);
  }
  const kind = asEvidenceSourceKind(input.sourceKind);
  if (!kind) {
    errors.push(
      `Invalid source_kind: must be one of ${EVIDENCE_SOURCE_KINDS.join(', ')}.`,
    );
    return errors;
  }
  switch (kind) {
    case 'external_url':
      if (!input.sourceUrl || !String(input.sourceUrl).trim()) {
        errors.push('source_url is required when source_kind = external_url.');
      }
      break;
    case 'notebook_entry':
    case 'paper':
    case 'dataset':
      if (!input.sourceId || !String(input.sourceId).trim()) {
        errors.push(`source_id is required when source_kind = ${kind}.`);
      }
      break;
    case 'free_text':
      if (!input.notes || !String(input.notes).trim()) {
        errors.push('notes is required when source_kind = free_text.');
      }
      break;
  }
  return errors;
}
