/**
 * Research OS Phase 6 — Cross-experiment dependency graph domain types.
 *
 * A dependency is a directed edge in a per-user experiment graph. The edge
 * `(fromExperimentId → toExperimentId, kind='feeds')` reads "from depends
 * on to" (or, for kind='blocks', "to blocks from"). Kinds:
 *
 *   feeds       — default; to feeds data/output into from.
 *   blocks      — hard dependency; surfaces on the Top Blockers feed.
 *   informs     — soft, informational only.
 *   replicates  — from replicates the protocol or findings of to.
 *
 * Status:
 *
 *   open    — live edge.
 *   cleared — resolved, kept for history.
 *
 * No database calls here — those live in `dependencies-repo.ts`.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

// ─── Kind + status taxonomy ───────────────────────────────────────────────

export const DEPENDENCY_KIND_VALUES = [
  'feeds',
  'blocks',
  'informs',
  'replicates',
] as const;

export type DependencyKind = (typeof DEPENDENCY_KIND_VALUES)[number];

export const DEPENDENCY_KIND_LABELS: Record<DependencyKind, string> = {
  feeds: 'Feeds',
  blocks: 'Blocks',
  informs: 'Informs',
  replicates: 'Replicates',
};

export const DEPENDENCY_STATUS_VALUES = ['open', 'cleared'] as const;
export type DependencyStatus = (typeof DEPENDENCY_STATUS_VALUES)[number];

export const DEPENDENCY_STATUS_LABELS: Record<DependencyStatus, string> = {
  open: 'Open',
  cleared: 'Cleared',
};

// ─── Entity ───────────────────────────────────────────────────────────────

export interface ExperimentDependency {
  id: string;
  userId: string;
  fromExperimentId: string;
  toExperimentId: string;
  kind: DependencyKind;
  status: DependencyStatus;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDependencyInput {
  toExperimentId: string;
  kind?: DependencyKind;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateDependencyInput {
  kind?: DependencyKind;
  status?: DependencyStatus;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Hydrated peer-experiment info attached to a directed edge. When the peer
 * is owned by another user (cross-ownership), the route layer drops the
 * edge from the list entirely — there is no leaked stub.
 */
export interface DependencyPeerExperiment {
  id: string;
  name: string;
  status: string;
}

export interface ExperimentDependencyHydrated extends ExperimentDependency {
  peer: DependencyPeerExperiment;
}

/**
 * Shape returned by GET /experiments/[id]/dependencies — both directions
 * separated. Each edge is hydrated with the peer experiment's snapshot.
 */
export interface ExperimentDependenciesView {
  upstream: ExperimentDependencyHydrated[];
  downstream: ExperimentDependencyHydrated[];
}

// ─── Validators ───────────────────────────────────────────────────────────

export function validateDependencyKind(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(DEPENDENCY_KIND_VALUES as readonly string[]).includes(value)
  ) {
    return `kind must be one of: ${DEPENDENCY_KIND_VALUES.join(', ')}.`;
  }
  return null;
}

export function validateDependencyStatus(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(DEPENDENCY_STATUS_VALUES as readonly string[]).includes(value)
  ) {
    return `status must be one of: ${DEPENDENCY_STATUS_VALUES.join(', ')}.`;
  }
  return null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateExperimentUuid(value: unknown): string | null {
  if (typeof value !== 'string') return 'experiment id must be a string UUID.';
  if (!UUID_PATTERN.test(value)) return 'experiment id must be a UUID.';
  return null;
}

/**
 * Validate a candidate dependency edge — self-loop rejection + both-side
 * UUID format. Cross-ownership check runs against the database in the repo.
 */
export function validateDependencyEdge(
  fromExperimentId: unknown,
  toExperimentId: unknown,
): string | null {
  const fromErr = validateExperimentUuid(fromExperimentId);
  if (fromErr) return `from: ${fromErr}`;
  const toErr = validateExperimentUuid(toExperimentId);
  if (toErr) return `to: ${toErr}`;
  if (
    String(fromExperimentId).toLowerCase() === String(toExperimentId).toLowerCase()
  ) {
    return 'An experiment cannot depend on itself.';
  }
  return null;
}
