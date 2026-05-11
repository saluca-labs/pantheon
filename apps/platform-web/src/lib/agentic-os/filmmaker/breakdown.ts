/**
 * Filmmaker OS — Breakdown domain types and constants.
 *
 * Production elements tagged on scenes (cast, props, vfx, etc.) plus
 * per-scene production metadata (page eighths, complexity, status).
 *
 * No database calls here — those live in repo.ts.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

// ─── Categories ─────────────────────────────────────────────────────────────

export const BREAKDOWN_CATEGORY_VALUES = [
  'cast',
  'extras',
  'stunts',
  'props',
  'vehicles',
  'animals',
  'costume',
  'makeup',
  'set_dressing',
  'special_effects',
  'sound_effects',
  'music',
  'location',
  'other',
] as const;

export type BreakdownCategory = (typeof BREAKDOWN_CATEGORY_VALUES)[number];

export interface BreakdownCategoryInfo {
  category: BreakdownCategory;
  label: string;
  icon: string;
  color: string;
}

export const BREAKDOWN_CATEGORIES: BreakdownCategoryInfo[] = [
  { category: 'cast', label: 'Cast', icon: 'Users', color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  { category: 'extras', label: 'Extras', icon: 'Users2', color: 'text-teal-300 bg-teal-500/10 border-teal-500/30' },
  { category: 'stunts', label: 'Stunts', icon: 'Zap', color: 'text-red-300 bg-red-500/10 border-red-500/30' },
  { category: 'props', label: 'Props', icon: 'Package', color: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  { category: 'vehicles', label: 'Vehicles', icon: 'Car', color: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' },
  { category: 'animals', label: 'Animals', icon: 'PawPrint', color: 'text-orange-300 bg-orange-500/10 border-orange-500/30' },
  { category: 'costume', label: 'Costume', icon: 'Shirt', color: 'text-pink-300 bg-pink-500/10 border-pink-500/30' },
  { category: 'makeup', label: 'Makeup', icon: 'Palette', color: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
  { category: 'set_dressing', label: 'Set Dressing', icon: 'Sofa', color: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30' },
  { category: 'special_effects', label: 'Special FX', icon: 'Sparkles', color: 'text-violet-300 bg-violet-500/10 border-violet-500/30' },
  { category: 'sound_effects', label: 'Sound FX', icon: 'Volume2', color: 'text-blue-300 bg-blue-500/10 border-blue-500/30' },
  { category: 'music', label: 'Music', icon: 'Music', color: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30' },
  { category: 'location', label: 'Location', icon: 'MapPin', color: 'text-lime-300 bg-lime-500/10 border-lime-500/30' },
  { category: 'other', label: 'Other', icon: 'Tag', color: 'text-[#94a3b8] bg-[#1a1d27] border-[#2a2d3e]' },
];

export const BREAKDOWN_CATEGORY_LABEL: Record<BreakdownCategory, string> =
  Object.fromEntries(
    BREAKDOWN_CATEGORIES.map((c) => [c.category, c.label]),
  ) as Record<BreakdownCategory, string>;

// ─── Scene complexity / status ──────────────────────────────────────────────

export const SCENE_COMPLEXITY_VALUES = [
  'simple',
  'standard',
  'complex',
  'epic',
] as const;

export type SceneComplexity = (typeof SCENE_COMPLEXITY_VALUES)[number];

export interface SceneComplexityInfo {
  complexity: SceneComplexity;
  label: string;
  description: string;
}

export const SCENE_COMPLEXITIES: SceneComplexityInfo[] = [
  { complexity: 'simple', label: 'Simple', description: 'One location, minimal setup.' },
  { complexity: 'standard', label: 'Standard', description: 'Average coverage, normal pace.' },
  { complexity: 'complex', label: 'Complex', description: 'Heavy setups, multiple departments.' },
  { complexity: 'epic', label: 'Epic', description: 'Stunts/VFX/large cast — own block.' },
];

export const SCENE_STATUS_VALUES = [
  'unscheduled',
  'scheduled',
  'shot',
  'omitted',
  'reshoot_needed',
] as const;

export type SceneStatus = (typeof SCENE_STATUS_VALUES)[number];

export interface SceneStatusInfo {
  status: SceneStatus;
  label: string;
  color: string;
}

export const SCENE_STATUSES: SceneStatusInfo[] = [
  { status: 'unscheduled', label: 'Unscheduled', color: 'text-[#94a3b8] bg-[#1a1d27] border-[#2a2d3e]' },
  { status: 'scheduled', label: 'Scheduled', color: 'text-blue-300 bg-blue-500/10 border-blue-500/30' },
  { status: 'shot', label: 'Shot', color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  { status: 'omitted', label: 'Omitted', color: 'text-[#64748b] bg-[#0f1117] border-[#2a2d3e]' },
  { status: 'reshoot_needed', label: 'Reshoot', color: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
];

export const SCENE_STATUS_LABEL: Record<SceneStatus, string> = Object.fromEntries(
  SCENE_STATUSES.map((s) => [s.status, s.label]),
) as Record<SceneStatus, string>;

// ─── Entities ───────────────────────────────────────────────────────────────

export interface BreakdownElement {
  id: string;
  screenplayId: string;
  sceneId: string;
  category: BreakdownCategory;
  name: string;
  description: string | null;
  quantity: number;
  isPrincipal: boolean;
  characterId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BreakdownElementUpsert {
  category: BreakdownCategory;
  name: string;
  description?: string | null;
  quantity?: number;
  isPrincipal?: boolean;
  characterId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SceneBreakdownMeta {
  id: string;
  sceneId: string;
  eighths: number;
  estShootMinutes: number | null;
  notes: string | null;
  complexity: SceneComplexity | null;
  status: SceneStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SceneBreakdownMetaUpsert {
  eighths?: number;
  estShootMinutes?: number | null;
  notes?: string | null;
  complexity?: SceneComplexity | null;
  status?: SceneStatus;
  metadata?: Record<string, unknown>;
}

export interface BreakdownSummaryByCategory {
  category: BreakdownCategory;
  count: number;
}

export interface ProjectBreakdownSummary {
  totalScenes: number;
  scenesWithBreakdown: number;
  totalElements: number;
  totalEighths: number;
  totalPages: number;
  byCategory: BreakdownSummaryByCategory[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Sum eighths across an array of scene metas. 8 eighths = 1 page. */
export function sumEighths(metas: { eighths: number }[]): { total: number; pages: number } {
  const total = metas.reduce((acc, m) => acc + (m.eighths ?? 0), 0);
  return { total, pages: total / 8 };
}

/**
 * Format eighths as a `'2 2/8'` style label used in production paperwork.
 * 0 eighths → `'0'`. Whole pages → `'3'`. Fractional → `'2 3/8'`.
 */
export function pagesLabel(eighths: number): string {
  if (!eighths || eighths <= 0) return '0';
  const pages = Math.floor(eighths / 8);
  const remainder = eighths % 8;
  if (remainder === 0) return String(pages);
  if (pages === 0) return `${remainder}/8`;
  return `${pages} ${remainder}/8`;
}
