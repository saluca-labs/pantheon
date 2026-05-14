/**
 * Filmmaker OS — Storyboard domain types and constants.
 *
 * A storyboard is a per-project visual board with ordered panels. Each
 * panel can carry an image URL plus camera and shot annotations. The
 * optional `sceneId` link wires a board to a specific scene from the
 * head screenplay version.
 *
 * No database calls here — those live in repo.ts.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

// ─── Status ────────────────────────────────────────────────────────────────

export const STORYBOARD_STATUS_VALUES = [
  'draft',
  'approved',
  'archived',
] as const;

export type StoryboardStatus = (typeof STORYBOARD_STATUS_VALUES)[number];

export interface StoryboardStatusInfo {
  status: StoryboardStatus;
  label: string;
  color: string;
}

export const STORYBOARD_STATUSES: StoryboardStatusInfo[] = [
  {
    status: 'draft',
    label: 'Draft',
    color: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  },
  {
    status: 'approved',
    label: 'Approved',
    color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  },
  {
    status: 'archived',
    label: 'Archived',
    color: 'text-[#64748b] bg-surface-0 border-border-subtle',
  },
];

export const STORYBOARD_STATUS_LABEL: Record<StoryboardStatus, string> =
  Object.fromEntries(
    STORYBOARD_STATUSES.map((s) => [s.status, s.label]),
  ) as Record<StoryboardStatus, string>;

// ─── Entities ──────────────────────────────────────────────────────────────

export interface Storyboard {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  sceneId: string | null;
  status: StoryboardStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StoryboardUpsert {
  name?: string;
  description?: string | null;
  sceneId?: string | null;
  status?: StoryboardStatus;
  metadata?: Record<string, unknown>;
}

export interface StoryboardPanel {
  id: string;
  storyboardId: string;
  position: number;
  imageUrl: string | null;
  cameraAngle: string | null;
  cameraMove: string | null;
  shotSize: string | null;
  description: string | null;
  dialogueExcerpt: string | null;
  durationSeconds: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoryboardPanelUpsert {
  imageUrl?: string | null;
  cameraAngle?: string | null;
  cameraMove?: string | null;
  shotSize?: string | null;
  description?: string | null;
  dialogueExcerpt?: string | null;
  durationSeconds?: number | null;
  notes?: string | null;
}

export interface StoryboardWithPanels extends Storyboard {
  panels: StoryboardPanel[];
}

export interface StoryboardSummary {
  id: string;
  name: string;
  status: StoryboardStatus;
  sceneId: string | null;
  panelCount: number;
  updatedAt: string;
}
