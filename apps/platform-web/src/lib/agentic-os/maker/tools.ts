/**
 * Maker OS — Tool domain types and pure helpers.
 *
 * A tool is a workshop-global asset: a CNC, 3D printer, oscilloscope, etc.
 * Tools belong to a workshop (user), NOT to a build — projects link to tools
 * via the `agos_maker_project_tools` join table.
 *
 * No database calls here — those live in `repo.ts`.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

// ─── Kind taxonomy ────────────────────────────────────────────────────────

export const TOOL_KIND_VALUES = [
  'cnc',
  '3d_printer',
  'laser',
  'soldering',
  'oscilloscope',
  'multimeter',
  'handtool',
  'powertool',
  'other',
] as const;

export type ToolKind = (typeof TOOL_KIND_VALUES)[number];

export const TOOL_KIND_LABELS: Record<ToolKind, string> = {
  cnc: 'CNC',
  '3d_printer': '3D printer',
  laser: 'Laser',
  soldering: 'Soldering iron',
  oscilloscope: 'Oscilloscope',
  multimeter: 'Multimeter',
  handtool: 'Hand tool',
  powertool: 'Power tool',
  other: 'Other',
};

export interface ToolKindInfo {
  value: ToolKind;
  label: string;
  /** Lucide icon name — UI imports the icon component by string lookup. */
  icon: string;
}

export const TOOL_KINDS: ToolKindInfo[] = [
  { value: 'cnc',          label: 'CNC',            icon: 'Cog' },
  { value: '3d_printer',   label: '3D printer',     icon: 'Printer' },
  { value: 'laser',        label: 'Laser',          icon: 'Zap' },
  { value: 'soldering',    label: 'Soldering iron', icon: 'Flame' },
  { value: 'oscilloscope', label: 'Oscilloscope',   icon: 'Activity' },
  { value: 'multimeter',   label: 'Multimeter',     icon: 'Gauge' },
  { value: 'handtool',     label: 'Hand tool',      icon: 'Hammer' },
  { value: 'powertool',    label: 'Power tool',     icon: 'Drill' },
  { value: 'other',        label: 'Other',          icon: 'Wrench' },
];

// ─── Status taxonomy ──────────────────────────────────────────────────────

export const TOOL_STATUS_VALUES = ['active', 'down', 'retired'] as const;

export type ToolStatus = (typeof TOOL_STATUS_VALUES)[number];

export const TOOL_STATUS_LABELS: Record<ToolStatus, string> = {
  active: 'Active',
  down: 'Down',
  retired: 'Retired',
};

// ─── Tool entity ──────────────────────────────────────────────────────────

export interface Tool {
  id: string;
  userId: string;
  name: string;
  kind: ToolKind;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  location: string | null;
  status: ToolStatus;
  /** YYYY-MM-DD calendar date or null. */
  purchasedAt: string | null;
  imageUrl: string | null;
  datasheetUrl: string | null;
  manualUrl: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ToolUpsert {
  name: string;
  kind: ToolKind;
  manufacturer?: string | null;
  model?: string | null;
  serial?: string | null;
  location?: string | null;
  status?: ToolStatus;
  purchasedAt?: string | null;
  imageUrl?: string | null;
  datasheetUrl?: string | null;
  manualUrl?: string | null;
  notes?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type ToolPatch = Partial<ToolUpsert>;

// ─── Project-tool link entity ─────────────────────────────────────────────

export interface ProjectToolLink {
  id: string;
  projectId: string;
  toolId: string;
  required: boolean;
  notes: string | null;
  createdAt: string;
}

export interface ProjectToolLinkUpsert {
  toolId: string;
  required?: boolean;
  notes?: string | null;
}

/**
 * Joined view returned by GET /projects/[id]/tools — carries enough of the
 * tool row to render a row without a second fetch.
 */
export interface ProjectToolJoined extends ProjectToolLink {
  toolName: string;
  toolKind: ToolKind;
  toolStatus: ToolStatus;
}

// ─── Validators ───────────────────────────────────────────────────────────

export function validateToolKind(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(TOOL_KIND_VALUES as readonly string[]).includes(value)
  ) {
    return `kind must be one of: ${TOOL_KIND_VALUES.join(', ')}.`;
  }
  return null;
}

export function validateToolStatus(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(TOOL_STATUS_VALUES as readonly string[]).includes(value)
  ) {
    return `status must be one of: ${TOOL_STATUS_VALUES.join(', ')}.`;
  }
  return null;
}

export function validateToolName(value: unknown): string | null {
  if (typeof value !== 'string') return 'name must be a string.';
  const trimmed = value.trim();
  if (!trimmed) return 'name is required.';
  if (trimmed.length > 200) return 'name must be at most 200 characters.';
  return null;
}

/**
 * Validate purchasedAt — must be either null or a YYYY-MM-DD calendar date
 * that parses to a real day. Returns an error string or null.
 */
export function validatePurchasedAt(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    return 'purchasedAt must be a YYYY-MM-DD string or null.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'purchasedAt must match YYYY-MM-DD.';
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) {
    return 'purchasedAt is not a real calendar date.';
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

export const TOOL_STATUS_ORDER: Record<ToolStatus, number> = {
  active: 0,
  down: 1,
  retired: 2,
};

/**
 * Sort tools by status (active → down → retired), then by name ASC. Pure —
 * the DB query already orders by status + updated_at; this helper is the
 * client-side stable sort.
 */
export function sortTools(tools: Tool[]): Tool[] {
  return [...tools].sort((a, b) => {
    const sa = TOOL_STATUS_ORDER[a.status] ?? 99;
    const sb = TOOL_STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Aggregate tool counts by status. Used by the tool-list header strip.
 */
export interface ToolStats {
  total: number;
  active: number;
  down: number;
  retired: number;
}

export function summarizeTools(tools: Tool[]): ToolStats {
  let active = 0;
  let down = 0;
  let retired = 0;
  for (const t of tools) {
    if (t.status === 'active') active += 1;
    else if (t.status === 'down') down += 1;
    else if (t.status === 'retired') retired += 1;
  }
  return { total: tools.length, active, down, retired };
}
