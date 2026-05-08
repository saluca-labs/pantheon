/**
 * Maker OS — parts inventory domain logic.
 *
 * Provides type definitions and pure-logic helpers for project builds and
 * parts inventory. No database calls here — those live in repo.ts.
 *
 * References:
 *   - CRUD entity model inspired by open-source BOM conventions:
 *     https://indabom.com/  (MIT license)
 *   - Part categories from common maker/hardware terminology (public domain).
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

export type BuildStatus = 'planning' | 'in_progress' | 'on_hold' | 'complete' | 'archived';

export type PartCategory =
  | 'electronic'
  | 'mechanical'
  | 'fastener'
  | 'material'
  | 'tool'
  | 'consumable'
  | 'other';

export interface BuildProject {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: BuildStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PartItem {
  id: string;
  buildId: string;
  name: string;
  category: PartCategory;
  quantity: number;
  unit: string;
  notes: string | null;
  sourceUrl: string | null;
  inStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export const BUILD_STATUSES: { value: BuildStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'complete', label: 'Complete' },
  { value: 'archived', label: 'Archived' },
];

export const PART_CATEGORIES: { value: PartCategory; label: string }[] = [
  { value: 'electronic', label: 'Electronic' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'fastener', label: 'Fastener' },
  { value: 'material', label: 'Material' },
  { value: 'tool', label: 'Tool' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'other', label: 'Other' },
];

/**
 * Summarise build-level inventory stats: total parts, missing parts count,
 * and in-stock percentage (0-100, rounded to integer).
 */
export function summariseInventory(parts: PartItem[]): {
  total: number;
  inStock: number;
  missing: number;
  pctReady: number;
} {
  const total = parts.length;
  const inStock = parts.filter((p) => p.inStock).length;
  const missing = total - inStock;
  const pctReady = total === 0 ? 0 : Math.round((inStock / total) * 100);
  return { total, inStock, missing, pctReady };
}

/**
 * Validate a part quantity — must be a positive integer.
 * Returns an error string or null when valid.
 */
export function validateQuantity(qty: unknown): string | null {
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1) {
    return 'Quantity must be a positive integer.';
  }
  return null;
}

/**
 * Return a URL-safe build slug derived from the project name.
 * Lowercases, replaces spaces and special chars with hyphens, dedupes hyphens.
 */
export function buildSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
