/**
 * Filmmaker OS — Screenplay domain types and constants.
 *
 * The Fountain-format editor is the centrepiece of the Filmmaker OS:
 * every downstream phase (breakdown, schedule, AI coverage) reads from
 * the scenes table produced when a version is saved.
 *
 * No database calls here — those live in repo.ts.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

// ─── Format taxonomy ────────────────────────────────────────────────────────

export const SCREENPLAY_FORMAT_VALUES = [
  'feature',
  'short',
  'tv_pilot',
  'tv_episode',
  'webisode',
  'stage_play',
] as const;

export type ScreenplayFormat = (typeof SCREENPLAY_FORMAT_VALUES)[number];

export interface ScreenplayFormatInfo {
  format: ScreenplayFormat;
  label: string;
  description: string;
}

export const SCREENPLAY_FORMATS: ScreenplayFormatInfo[] = [
  { format: 'feature', label: 'Feature', description: 'Full-length feature film.' },
  { format: 'short', label: 'Short', description: 'Short film, typically under 40 pages.' },
  { format: 'tv_pilot', label: 'TV Pilot', description: 'Pilot episode for a series.' },
  { format: 'tv_episode', label: 'TV Episode', description: 'Episode within an existing series.' },
  { format: 'webisode', label: 'Webisode', description: 'Web-native short-form episode.' },
  { format: 'stage_play', label: 'Stage Play', description: 'Theatrical script.' },
];

export const SCREENPLAY_FORMAT_LABEL: Record<ScreenplayFormat, string> =
  Object.fromEntries(SCREENPLAY_FORMATS.map((f) => [f.format, f.label])) as Record<
    ScreenplayFormat,
    string
  >;

// ─── Status taxonomy ────────────────────────────────────────────────────────

export const SCREENPLAY_STATUS_VALUES = [
  'draft',
  'revision',
  'production_draft',
  'shooting_script',
  'archived',
] as const;

export type ScreenplayStatus = (typeof SCREENPLAY_STATUS_VALUES)[number];

export interface ScreenplayStatusInfo {
  status: ScreenplayStatus;
  label: string;
  description: string;
}

export const SCREENPLAY_STATUSES: ScreenplayStatusInfo[] = [
  { status: 'draft', label: 'Draft', description: 'Working draft.' },
  { status: 'revision', label: 'Revision', description: 'In active revision.' },
  {
    status: 'production_draft',
    label: 'Production Draft',
    description: 'Locked for pre-production planning.',
  },
  {
    status: 'shooting_script',
    label: 'Shooting Script',
    description: 'Locked, numbered, ready for set.',
  },
  { status: 'archived', label: 'Archived', description: 'Retired / shelved.' },
];

export const SCREENPLAY_STATUS_LABEL: Record<ScreenplayStatus, string> =
  Object.fromEntries(SCREENPLAY_STATUSES.map((s) => [s.status, s.label])) as Record<
    ScreenplayStatus,
    string
  >;

// ─── Entities ───────────────────────────────────────────────────────────────

export interface Screenplay {
  id: string;
  projectId: string;
  title: string;
  format: ScreenplayFormat;
  status: ScreenplayStatus;
  headVersionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ScreenplayUpsert {
  title?: string;
  format?: ScreenplayFormat;
  status?: ScreenplayStatus;
  metadata?: Record<string, unknown>;
}

export interface ScreenplayVersion {
  id: string;
  screenplayId: string;
  versionNumber: number;
  label: string | null;
  isHead: boolean;
  fountainText: string;
  wordCount: number;
  pageCountEstimate: number;
  createdAt: string;
}

export interface ScreenplayScene {
  id: string;
  screenplayId: string;
  versionId: string;
  sceneNumber: number;
  heading: string;
  interior: boolean | null;
  location: string | null;
  timeOfDay: string | null;
  pageStart: number | null;
  eighths: number | null;
  dialogueWordCounts: Record<string, number>;
  actionText: string | null;
  dialogueText: string | null;
  metadata: Record<string, unknown>;
}

// Re-export parsed shapes from the parser for one import path.
export type {
  ParseResult,
  ParsedScene,
  ParsedCharacterStat,
} from './fountain-parser';
