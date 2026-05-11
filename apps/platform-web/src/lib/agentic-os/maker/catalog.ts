/**
 * Maker OS — Parts catalog domain types and pure helpers.
 *
 * Phase 2 promotes parts from a per-project flat list (legacy
 * `agos_maker_parts`) into a workshop-global catalog (`agos_maker_part_catalog`)
 * with optional variants and supplier links. The catalog row is the logical
 * SKU; per-project demand lives on the BOM (see `bom.ts`).
 *
 * No database calls here — those live in `repo.ts`.
 *
 * Category taxonomy mirrors the Phase 1 `inventory.ts` 7-value enum so the
 * one-shot data migration in 0035_maker_phase2 round-trips without lossy
 * remapping.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

// ─── Category taxonomy ────────────────────────────────────────────────────

export const PART_CATEGORY_VALUES = [
  'electronic',
  'mechanical',
  'fastener',
  'material',
  'tool',
  'consumable',
  'other',
] as const;

export type PartCategory = (typeof PART_CATEGORY_VALUES)[number];

export const PART_CATEGORY_LABELS: Record<PartCategory, string> = {
  electronic: 'Electronic',
  mechanical: 'Mechanical',
  fastener: 'Fastener',
  material: 'Material',
  tool: 'Tool',
  consumable: 'Consumable',
  other: 'Other',
};

export interface PartCategoryInfo {
  value: PartCategory;
  label: string;
}

export const PART_CATEGORIES: PartCategoryInfo[] = PART_CATEGORY_VALUES.map(
  (value) => ({ value, label: PART_CATEGORY_LABELS[value] }),
);

// ─── Catalog entity ───────────────────────────────────────────────────────

export interface PartCatalogRow {
  id: string;
  userId: string;
  name: string;
  category: PartCategory;
  manufacturer: string | null;
  mfgPartNumber: string | null;
  unit: string;
  parentPartCatalogId: string | null;
  quantityOnHand: number;
  defaultSupplierId: string | null;
  datasheetUrl: string | null;
  imageUrl: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PartCatalogUpsert {
  name: string;
  category?: PartCategory;
  manufacturer?: string | null;
  mfgPartNumber?: string | null;
  unit?: string;
  parentPartCatalogId?: string | null;
  quantityOnHand?: number;
  defaultSupplierId?: string | null;
  datasheetUrl?: string | null;
  imageUrl?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ─── Variant entity ───────────────────────────────────────────────────────

export interface PartVariant {
  id: string;
  partCatalogId: string;
  variantLabel: string;
  quantityOnHand: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PartVariantUpsert {
  variantLabel: string;
  quantityOnHand?: number;
  metadata?: Record<string, unknown>;
}

// ─── Validators ───────────────────────────────────────────────────────────

export function validatePartCategory(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(PART_CATEGORY_VALUES as readonly string[]).includes(value)
  ) {
    return `Category must be one of: ${PART_CATEGORY_VALUES.join(', ')}.`;
  }
  return null;
}

/**
 * Validate a NUMERIC on-hand quantity — must be a finite, non-negative
 * number. Returns an error string or null when valid.
 */
export function validateOnHand(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 'quantity_on_hand must be a non-negative number.';
  }
  return null;
}

/**
 * Validate a free-form tag array — each tag a short non-empty string, max 20
 * tags total.
 */
export function validateTags(value: unknown): string | null {
  if (!Array.isArray(value)) return 'tags must be an array of strings.';
  if (value.length > 20) return 'tags array must have at most 20 entries.';
  for (const t of value) {
    if (typeof t !== 'string' || !t.trim()) {
      return 'each tag must be a non-empty string.';
    }
    if (t.length > 60) {
      return `tag too long (max 60 chars): ${t.slice(0, 20)}…`;
    }
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Normalize a tag list — lowercase, trim, drop empties, dedupe while
 * preserving order. Pure helper; matches the storage convention used by the
 * catalog GIN index.
 */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const cleaned = t.trim().toLowerCase();
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

/**
 * Sum the on-hand counts of a catalog row plus its variants. Variants
 * "shadow" the parent on-hand — Phase 2 stores variant on-hand independently
 * so a fully-variant SKU can keep the parent count at 0.
 */
export function totalOnHand(
  row: PartCatalogRow,
  variants: PartVariant[] = [],
): number {
  let sum = row.quantityOnHand;
  for (const v of variants) sum += v.quantityOnHand;
  return sum;
}

/** Format a NUMERIC quantity for display (max 3 fractional digits, trim trailing zeros). */
export function formatQuantity(qty: number): string {
  if (!Number.isFinite(qty)) return '—';
  if (Number.isInteger(qty)) return String(qty);
  return qty.toFixed(3).replace(/\.?0+$/, '');
}
