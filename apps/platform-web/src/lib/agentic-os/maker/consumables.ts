/**
 * Maker OS — Tool-consumable domain types and pure helpers.
 *
 * A consumable is a child of a tool that wears out: a CNC end mill, a saw
 * blade, a 3D-printer hot end, a fume-extractor filter. The tool itself
 * persists; the consumable has hours_remaining that ticks toward zero.
 *
 * No database calls here — those live in `repo.ts`.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

// ─── Kind taxonomy ────────────────────────────────────────────────────────
//
// Free-form on the column (TEXT, not CHECK) so the UI can extend the picker
// without a migration. The locked list below is the picker default; callers
// may pass any string and the repo will persist it verbatim.

export const CONSUMABLE_KIND_VALUES = [
  'bit',
  'blade',
  'filter',
  'nozzle',
  'endmill',
  'other',
] as const;

export type ConsumableKind = (typeof CONSUMABLE_KIND_VALUES)[number];

export const CONSUMABLE_KIND_LABELS: Record<ConsumableKind, string> = {
  bit: 'Bit',
  blade: 'Blade',
  filter: 'Filter',
  nozzle: 'Nozzle',
  endmill: 'End mill',
  other: 'Other',
};

// ─── Consumable entity ────────────────────────────────────────────────────

export interface ToolConsumable {
  id: string;
  toolId: string;
  name: string;
  kind: string | null;
  hoursRemaining: number | null;
  maxHours: number | null;
  lastReplacedAt: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ToolConsumableUpsert {
  name: string;
  kind?: string | null;
  hoursRemaining?: number | null;
  maxHours?: number | null;
  lastReplacedAt?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export type ToolConsumablePatch = Partial<ToolConsumableUpsert>;

// ─── Validators ───────────────────────────────────────────────────────────

export function validateConsumableName(value: unknown): string | null {
  if (typeof value !== 'string') return 'name must be a string.';
  const trimmed = value.trim();
  if (!trimmed) return 'name is required.';
  if (trimmed.length > 200) return 'name must be at most 200 characters.';
  return null;
}

/**
 * Validate hoursRemaining / maxHours — must be either null or a finite
 * non-negative number. Decimals are allowed (NUMERIC column). Returns an
 * error string or null.
 */
export function validateHours(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'hours must be a number or null.';
  }
  if (value < 0) return 'hours must be non-negative.';
  return null;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Compute the percent-remaining for a consumable, in the range [0, 1].
 *
 * Returns null when either field is missing — the UI hides the progress bar
 * in that case. When both fields are present but maxHours is zero, returns
 * 0 (treated as "exhausted"). Clamps to [0, 1] so a manual hours_remaining
 * bump beyond maxHours still renders a sensible bar.
 */
export function percentRemaining(
  c: Pick<ToolConsumable, 'hoursRemaining' | 'maxHours'>,
): number | null {
  if (c.hoursRemaining == null || c.maxHours == null) return null;
  if (!Number.isFinite(c.hoursRemaining) || !Number.isFinite(c.maxHours)) {
    return null;
  }
  if (c.maxHours <= 0) return 0;
  const pct = c.hoursRemaining / c.maxHours;
  if (pct < 0) return 0;
  if (pct > 1) return 1;
  return pct;
}

/**
 * Status pill values for a consumable. Derived from percent-remaining so
 * the UI shows a colour band without the data model storing one.
 *
 *   exhausted — 0% or hoursRemaining <= 0 with maxHours known
 *   low       — <= 20% remaining
 *   ok        — 20-100% remaining
 *   unknown   — either field missing
 */
export const CONSUMABLE_STATUS_VALUES = [
  'exhausted',
  'low',
  'ok',
  'unknown',
] as const;

export type ConsumableStatus = (typeof CONSUMABLE_STATUS_VALUES)[number];

export function consumableStatus(
  c: Pick<ToolConsumable, 'hoursRemaining' | 'maxHours'>,
): ConsumableStatus {
  const pct = percentRemaining(c);
  if (pct == null) return 'unknown';
  if (pct <= 0) return 'exhausted';
  if (pct <= 0.2) return 'low';
  return 'ok';
}

/**
 * Format hours for display: integer when round, one decimal otherwise. Pure
 * — used by the consumable-tracker row label.
 */
export function formatHours(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

/**
 * Sort consumables: exhausted/low first (so the maker sees them at the top),
 * then ok, then unknown; ties broken by name ASC.
 */
const CONSUMABLE_STATUS_ORDER: Record<ConsumableStatus, number> = {
  exhausted: 0,
  low: 1,
  ok: 2,
  unknown: 3,
};

export function sortConsumables(items: ToolConsumable[]): ToolConsumable[] {
  return [...items].sort((a, b) => {
    const sa = CONSUMABLE_STATUS_ORDER[consumableStatus(a)];
    const sb = CONSUMABLE_STATUS_ORDER[consumableStatus(b)];
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });
}
