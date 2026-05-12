/**
 * Research OS Phase 5 — dataset domain types + pure helpers.
 *
 * Datasets are per-experiment (experiment_id NOT NULL, no FK per
 * platform v0.1.30 contract). The shape mirrors the workshop-global
 * Phase 4 papers row in spirit, but the lifecycle is much smaller —
 * datasets carry a `archived` boolean flag (was the raw data archived
 * externally — semantic, NOT a soft-delete marker), plus the usual
 * URL/version/checksum/tags. DB calls live in `datasets-repo.ts`.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { DATASET_KINDS, asDatasetKind, type DatasetKind } from './dataset-kinds';

// ─── Row shape ───────────────────────────────────────────────────────────────

export interface Dataset {
  id: string;
  userId: string;
  experimentId: string;
  name: string;
  kind: DatasetKind;
  url: string;
  version: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  archived: boolean;
  publishedDoi: string | null;
  notesMd: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Create / update inputs ─────────────────────────────────────────────────

export interface CreateDatasetInput {
  name: string;
  url: string;
  /** Defaults to `tabular` when omitted. */
  kind?: DatasetKind;
  version?: string | null;
  sizeBytes?: number | null;
  checksum?: string | null;
  archived?: boolean;
  publishedDoi?: string | null;
  notesMd?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type UpdateDatasetInput = Partial<{
  name: string;
  kind: DatasetKind;
  url: string;
  version: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  archived: boolean;
  publishedDoi: string | null;
  notesMd: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
}>;

// ─── Filter helpers ─────────────────────────────────────────────────────────

export interface DatasetsListOpts {
  /** Filter by kind. */
  kind?: DatasetKind;
  /** Filter by archived flag. When undefined, returns rows of either flag. */
  archived?: boolean;
  /** Filter by single tag (ANY match, case-insensitive). */
  tag?: string;
  limit?: number;
  offset?: number;
}

/**
 * Predicate used by tests + non-DB filters: does `dataset` match the
 * supplied opts? Mirrors the SQL filter logic in the repo.
 */
export function datasetMatchesFilter(
  dataset: Pick<Dataset, 'kind' | 'tags' | 'archived'>,
  opts: DatasetsListOpts,
): boolean {
  if (opts.kind && dataset.kind !== opts.kind) return false;
  if (opts.archived !== undefined && dataset.archived !== opts.archived) {
    return false;
  }
  if (opts.tag && opts.tag.trim()) {
    const t = opts.tag.trim().toLowerCase();
    if (!dataset.tags.some((x) => x.toLowerCase() === t)) return false;
  }
  return true;
}

// ─── Validators / normalizers ──────────────────────────────────────────────

/** Trim, lowercase, dedupe, drop empties, 60-char cap each, max 32 tags. */
export function normalizeDatasetTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const tidy = raw.trim().toLowerCase().slice(0, 60);
    if (!tidy) continue;
    if (seen.has(tidy)) continue;
    seen.add(tidy);
    out.push(tidy);
    if (out.length >= 32) break;
  }
  return out;
}

/** Returns true when value is a non-empty http(s) URL. */
export function isValidDatasetUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const tidy = value.trim();
  if (!tidy) return false;
  try {
    const u = new URL(tidy);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Returns null when valid, else a human-readable error message. */
export function validateDatasetName(value: unknown): string | null {
  if (typeof value !== 'string') return 'name must be a string';
  const tidy = value.trim();
  if (!tidy) return 'name is required';
  if (tidy.length > 200) return 'name must be 200 characters or fewer';
  return null;
}

/** Validate kind against the 6-value enum. Returns null on success. */
export function validateDatasetKind(value: unknown): string | null {
  if (asDatasetKind(value) == null) {
    return `kind must be one of: ${DATASET_KINDS.join(', ')}`;
  }
  return null;
}
