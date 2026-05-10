import 'server-only';
import type { CreateFoodItemInput } from './repo';

/**
 * Thin USDA FoodData Central client.
 *
 * Wraps the public search + detail endpoints behind the
 * ``USDA_FDC_API_KEY`` env var. When the key is missing, ``searchFoods``
 * returns ``[]`` and ``getFood`` throws ``UsdaNotConfiguredError`` so
 * route handlers can degrade gracefully (5b ships a 503 + inline UI
 * notice in that case).
 *
 * Rate-limit: 1000/hour with key. We do NOT retry inside the client —
 * callers are expected to cache aggressively in the food_item table.
 */

const FDC_BASE = 'https://api.nal.usda.gov/fdc/v1';

export class UsdaNotConfiguredError extends Error {
  constructor() {
    super('USDA FoodData Central API key not configured');
    this.name = 'UsdaNotConfiguredError';
  }
}

export class UsdaFetchError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'UsdaFetchError';
  }
}

function getApiKey(): string | null {
  const k = process.env['USDA_FDC_API_KEY'];
  return k && k.trim().length > 0 ? k.trim() : null;
}

export function isUsdaConfigured(): boolean {
  return getApiKey() !== null;
}

// ─── Public types ─────────────────────────────────────────────────────────

export interface FdcNutrient {
  nutrientId: number;
  nutrientName?: string;
  unitName?: string;
  value: number;
}

export interface FdcSearchResult {
  fdcId: number;
  description: string;
  brandName?: string | null;
  brandOwner?: string | null;
  dataType?: string;
  servingSize?: number | null;
  servingSizeUnit?: string | null;
  foodNutrients?: FdcNutrient[];
}

export interface FdcFoodDetail {
  fdcId: number;
  description: string;
  brandName?: string | null;
  brandOwner?: string | null;
  dataType?: string;
  servingSize?: number | null;
  servingSizeUnit?: string | null;
  foodNutrients: FdcNutrient[];
}

// ─── HTTP ─────────────────────────────────────────────────────────────────

interface SearchOpts {
  dataType?: string[];
  pageSize?: number;
}

export async function searchFoods(
  query: string,
  opts: SearchOpts = {},
): Promise<FdcSearchResult[]> {
  const key = getApiKey();
  if (!key) return [];
  const q = query.trim();
  if (q.length === 0) return [];
  const params = new URLSearchParams({
    api_key: key,
    query: q,
    pageSize: String(opts.pageSize ?? 20),
  });
  if (opts.dataType && opts.dataType.length > 0) {
    params.set('dataType', opts.dataType.join(','));
  }
  const r = await fetch(`${FDC_BASE}/foods/search?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!r.ok) {
    throw new UsdaFetchError(`USDA search failed: ${r.status}`, r.status);
  }
  const j = (await r.json()) as { foods?: FdcSearchResult[] };
  return j.foods ?? [];
}

export async function getFood(fdcId: number): Promise<FdcFoodDetail> {
  const key = getApiKey();
  if (!key) throw new UsdaNotConfiguredError();
  const r = await fetch(
    `${FDC_BASE}/food/${fdcId}?api_key=${encodeURIComponent(key)}`,
    { cache: 'no-store' },
  );
  if (!r.ok) {
    throw new UsdaFetchError(
      `USDA getFood failed: ${r.status}`,
      r.status,
    );
  }
  return (await r.json()) as FdcFoodDetail;
}

// ─── Mapping ──────────────────────────────────────────────────────────────

/** USDA nutrient ids → our column names. */
const NUTRIENT_MAP: Record<number, keyof MappedNutrients> = {
  1008: 'kcal',
  1003: 'proteinG',
  1005: 'carbsG',
  1004: 'fatG',
  1079: 'fiberG',
  2000: 'sugarG',
  1093: 'sodiumMg',
};

interface MappedNutrients {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

export type MappedFoodItem = CreateFoodItemInput & {
  usdaFdcId: string;
};

/**
 * Map an FDC food detail into the shape we cache in ``agos_mh_food_item``.
 *
 * Nutrients come back per 100g (default) OR per ``servingSize`` of
 * ``servingSizeUnit`` (for branded foods). We retain that fact:
 * - If ``servingSize`` is present, use it + the unit.
 * - Else mark the row as per-100g (``serving_size_g = 100``,
 *   ``serving_label = '100 g'``).
 */
export function mapFdcToFoodItem(detail: FdcFoodDetail): MappedFoodItem {
  const nutrients: MappedNutrients = {
    kcal: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
  };
  for (const n of detail.foodNutrients ?? []) {
    const key = NUTRIENT_MAP[n.nutrientId];
    if (key && typeof n.value === 'number') {
      nutrients[key] = Number(n.value);
    }
  }

  const hasServing =
    typeof detail.servingSize === 'number' && detail.servingSize > 0;
  const servingSizeG = hasServing
    ? gramsForUsdaUnit(detail.servingSize!, detail.servingSizeUnit ?? 'g')
    : 100;
  const servingLabel = hasServing
    ? `${detail.servingSize} ${detail.servingSizeUnit ?? 'g'}`
    : '100 g';

  const brand =
    detail.brandName ?? detail.brandOwner ?? null;

  return {
    name: detail.description,
    brand,
    servingSizeG,
    servingLabel,
    kcal: nutrients.kcal,
    proteinG: nutrients.proteinG,
    carbsG: nutrients.carbsG,
    fatG: nutrients.fatG,
    fiberG: nutrients.fiberG,
    sugarG: nutrients.sugarG,
    sodiumMg: nutrients.sodiumMg,
    metadata: {
      source: 'usda',
      fdcId: detail.fdcId,
      dataType: detail.dataType ?? null,
    },
    usdaFdcId: String(detail.fdcId),
  };
}

function gramsForUsdaUnit(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === 'g' || u === 'gram' || u === 'grams') return value;
  if (u === 'kg') return value * 1000;
  if (u === 'mg') return value / 1000;
  if (u === 'oz') return value * 28.3495;
  if (u === 'lb') return value * 453.592;
  // Unknown / volumetric — fall back to value as-is; UI will show the label.
  return value;
}
