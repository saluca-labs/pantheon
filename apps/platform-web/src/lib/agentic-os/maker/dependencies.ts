/**
 * Maker OS — Cross-project dependency graph domain types and pure helpers.
 *
 * A dependency is a directed edge in a per-user project graph. The edge
 * `(fromProjectId → toProjectId, kind='blocks')` reads "from depends on
 * to" (or equivalently, "to blocks from"). Kinds:
 *
 *   blocks    — hard dependency, ranks on the Top Blockers widget.
 *   informs   — soft, informational only.
 *   consumes  — from consumes an output of to.
 *   related   — bare cross-link with no semantic weight.
 *
 * Status:
 *
 *   open    — live edge.
 *   cleared — resolved, kept for history.
 *
 * No database calls here — those live in `repo.ts`.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

// ─── Kind + status taxonomy ───────────────────────────────────────────────

export const DEPENDENCY_KIND_VALUES = [
  'blocks',
  'informs',
  'consumes',
  'related',
] as const;

export type DependencyKind = (typeof DEPENDENCY_KIND_VALUES)[number];

export const DEPENDENCY_KIND_LABELS: Record<DependencyKind, string> = {
  blocks: 'Blocks',
  informs: 'Informs',
  consumes: 'Consumes',
  related: 'Related',
};

export const DEPENDENCY_STATUS_VALUES = ['open', 'cleared'] as const;
export type DependencyStatus = (typeof DEPENDENCY_STATUS_VALUES)[number];

export const DEPENDENCY_STATUS_LABELS: Record<DependencyStatus, string> = {
  open: 'Open',
  cleared: 'Cleared',
};

// ─── Entity ───────────────────────────────────────────────────────────────

export interface ProjectDependency {
  id: string;
  userId: string;
  fromProjectId: string;
  toProjectId: string;
  kind: DependencyKind;
  status: DependencyStatus;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDependencyUpsert {
  toProjectId: string;
  kind?: DependencyKind;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ProjectDependencyPatch {
  kind?: DependencyKind;
  status?: DependencyStatus;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Hydrated peer-project info, attached to a directed edge when the caller
 * has access to the peer side of the edge. When the peer is owned by
 * another user (cross-ownership), the route layer drops the edge from the
 * list entirely — there is no leaked stub.
 */
export interface DependencyPeerProject {
  id: string;
  name: string;
  status: string;
  /** Average phase progress percentage 0-100 (already coerced upstream). */
  phase: number;
}

export interface ProjectDependencyHydrated extends ProjectDependency {
  peer: DependencyPeerProject;
}

/**
 * The shape returned by GET /projects/[id]/dependencies — both directions
 * separated. Each edge is hydrated with the peer project's snapshot.
 */
export interface ProjectDependenciesView {
  upstream: ProjectDependencyHydrated[];
  downstream: ProjectDependencyHydrated[];
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

export function validateProjectUuid(value: unknown): string | null {
  if (typeof value !== 'string') return 'project id must be a string UUID.';
  if (!UUID_PATTERN.test(value)) return 'project id must be a UUID.';
  return null;
}

/**
 * Validate a candidate dependency edge — self-loop rejection + both-side
 * UUID format. Returns an error string or null. The cross-ownership check
 * runs against the database in the repo, not here.
 */
export function validateDependencyEdge(
  fromProjectId: unknown,
  toProjectId: unknown,
): string | null {
  const fromErr = validateProjectUuid(fromProjectId);
  if (fromErr) return `from: ${fromErr}`;
  const toErr = validateProjectUuid(toProjectId);
  if (toErr) return `to: ${toErr}`;
  if (String(fromProjectId).toLowerCase() === String(toProjectId).toLowerCase()) {
    return 'A project cannot depend on itself.';
  }
  return null;
}
