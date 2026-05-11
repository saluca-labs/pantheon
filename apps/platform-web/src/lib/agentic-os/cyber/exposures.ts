/**
 * CyberSec OS — Exposure domain types and constants.
 *
 * An Exposure is a (vulnerability × asset) junction with workflow state.
 * Mirrors `agos_cyber_exposures` from migration 0031_cyber_phase4.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

export const EXPOSURE_STATUS_VALUES = [
  'open',
  'in_progress',
  'accepted',
  'mitigated',
  'resolved',
  'false_positive',
] as const;

export type ExposureStatus = (typeof EXPOSURE_STATUS_VALUES)[number];

export const EXPOSURE_PRIORITY_VALUES = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;
export type ExposurePriority = (typeof EXPOSURE_PRIORITY_VALUES)[number];

export interface ExposureStatusMeta {
  value: ExposureStatus;
  label: string;
  /** Lower = earlier in the workflow. */
  order: number;
  color: string;
  /** Whether this status is terminal (closed). */
  closed: boolean;
}

export const EXPOSURE_STATUSES: ExposureStatusMeta[] = [
  { value: 'open',           label: 'Open',           order: 0, color: 'red',     closed: false },
  { value: 'in_progress',    label: 'In progress',    order: 1, color: 'amber',   closed: false },
  { value: 'accepted',       label: 'Accepted',       order: 2, color: 'slate',   closed: false },
  { value: 'mitigated',      label: 'Mitigated',      order: 3, color: 'blue',    closed: true  },
  { value: 'resolved',       label: 'Resolved',       order: 4, color: 'emerald', closed: true  },
  { value: 'false_positive', label: 'False positive', order: 5, color: 'slate',   closed: true  },
];

export interface ExposurePriorityMeta {
  value: ExposurePriority;
  label: string;
  /** Lower order = higher priority. */
  order: number;
  color: string;
}

export const EXPOSURE_PRIORITIES: ExposurePriorityMeta[] = [
  { value: 'p1', label: 'P1 — Critical',  order: 0, color: 'red'    },
  { value: 'p2', label: 'P2 — High',      order: 1, color: 'orange' },
  { value: 'p3', label: 'P3 — Medium',    order: 2, color: 'amber'  },
  { value: 'p4', label: 'P4 — Low',       order: 3, color: 'blue'   },
  { value: 'p5', label: 'P5 — Tracking',  order: 4, color: 'slate'  },
];

export interface Exposure {
  id: string;
  vulnerabilityId: string;
  assetId: string;
  ownerId: string;
  status: ExposureStatus;
  detectedAt: string;
  remediatedAt: string | null;
  detectedBy: string | null;
  assignedTo: string | null;
  priority: ExposurePriority;
  notes: string | null;
  evidenceUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Exposure row joined with display labels for the related vuln + asset. */
export interface ExposureWithRefs extends Exposure {
  vulnerabilityTitle: string;
  vulnerabilityCveId: string | null;
  vulnerabilitySeverity: string;
  assetName: string;
  assetCriticality: string;
}

export interface ExposureUpsert {
  vulnerabilityId: string;
  assetId: string;
  status?: ExposureStatus;
  detectedBy?: string | null;
  assignedTo?: string | null;
  priority?: ExposurePriority;
  notes?: string | null;
  evidenceUrl?: string | null;
  metadata?: Record<string, unknown>;
}

export type ExposurePatch = Partial<Omit<ExposureUpsert, 'vulnerabilityId' | 'assetId'>>;

/** Terminal statuses; an exposure in these states does not count as "open". */
export function isExposureClosed(e: Pick<Exposure, 'status'>): boolean {
  return (
    e.status === 'resolved' ||
    e.status === 'mitigated' ||
    e.status === 'false_positive'
  );
}
