/**
 * Research OS Phase 5 — protocol domain types + pure helpers.
 *
 * Protocols are workshop-global with version-history self-reference.
 * `parent_protocol_id` walks the tree; the root has
 * `parent_protocol_id IS NULL`. NO FK on parent_protocol_id so soft
 * tree-walks survive deletes of intermediate nodes.
 *
 * Loading a pinned protocol: search the parent-protocol tree (via
 * `parent_protocol_id` walk) for an exact `version` match; fall back
 * to the root's content if no match. The walker is pure — it operates
 * on a hydrated list of rows and is exported here for both repo + test
 * consumers.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { PROTOCOL_KINDS, asProtocolKind, type ProtocolKind } from './protocol-kinds';

// ─── Row shape ───────────────────────────────────────────────────────────────

export interface Protocol {
  id: string;
  userId: string;
  title: string;
  version: string;
  bodyMd: string;
  kind: ProtocolKind;
  attachedUrls: string[];
  tags: string[];
  parentProtocolId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Create / update inputs ─────────────────────────────────────────────────

export interface CreateProtocolInput {
  title: string;
  /** Defaults to '1.0' when omitted. */
  version?: string;
  bodyMd?: string;
  /** Defaults to 'method' when omitted. */
  kind?: ProtocolKind;
  attachedUrls?: string[];
  tags?: string[];
  /** Set on POST /protocols/[id]/versions only; null on root inserts. */
  parentProtocolId?: string | null;
  metadata?: Record<string, unknown>;
}

export type UpdateProtocolInput = Partial<{
  title: string;
  version: string;
  bodyMd: string;
  kind: ProtocolKind;
  attachedUrls: string[];
  tags: string[];
  metadata: Record<string, unknown>;
}>;

export interface BumpProtocolInput {
  version: string;
  bodyMd: string;
  notes?: string;
}

// ─── Filter helpers ─────────────────────────────────────────────────────────

export interface ProtocolsListOpts {
  /** Filter by kind. */
  kind?: ProtocolKind;
  /** Filter by single tag (ANY match, case-insensitive). */
  tag?: string;
  /** Free-text search across title. Case-insensitive, ILIKE. */
  q?: string;
  /**
   * When true, restrict to root rows (parent_protocol_id IS NULL).
   * Default true — the library page lists roots, not every revision.
   */
  rootsOnly?: boolean;
  limit?: number;
  offset?: number;
}

export function protocolMatchesFilter(
  protocol: Pick<Protocol, 'kind' | 'tags' | 'title' | 'parentProtocolId'>,
  opts: ProtocolsListOpts,
): boolean {
  if (opts.kind && protocol.kind !== opts.kind) return false;
  if (opts.tag && opts.tag.trim()) {
    const t = opts.tag.trim().toLowerCase();
    if (!protocol.tags.some((x) => x.toLowerCase() === t)) return false;
  }
  if (opts.q && opts.q.trim()) {
    const q = opts.q.trim().toLowerCase();
    if (!protocol.title.toLowerCase().includes(q)) return false;
  }
  if (opts.rootsOnly !== false && protocol.parentProtocolId != null) {
    return false;
  }
  return true;
}

// ─── Version-tree walker (pure) ─────────────────────────────────────────────

/**
 * Given a flat list of protocol rows that share the same tree (a root
 * plus every descendant of that root), return the entire chain ordered
 * oldest-first. Implementation walks `parent_protocol_id` pointers in
 * either direction.
 *
 * If the list contains rows from multiple trees, only the tree
 * containing `startId` is returned.
 */
export function buildVersionChain(
  rows: Protocol[],
  startId: string,
): Protocol[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const start = byId.get(startId);
  if (!start) return [];

  // Walk up to the root.
  let cur: Protocol | undefined = start;
  let root: Protocol = start;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    if (cur.parentProtocolId == null) {
      root = cur;
      break;
    }
    const parent = byId.get(cur.parentProtocolId);
    if (!parent) {
      // Orphan parent pointer — treat current as the root.
      root = cur;
      break;
    }
    cur = parent;
  }

  // Walk down from root via a BFS over rows whose parent_protocol_id
  // points back into the visited set.
  const ordered: Protocol[] = [root];
  const visited = new Set<string>([root.id]);
  let added = true;
  while (added) {
    added = false;
    for (const row of rows) {
      if (visited.has(row.id)) continue;
      if (row.parentProtocolId != null && visited.has(row.parentProtocolId)) {
        ordered.push(row);
        visited.add(row.id);
        added = true;
      }
    }
  }

  // Sort children by created_at so the chain is deterministic.
  ordered.sort((a, b) => {
    if (a.id === root.id) return -1;
    if (b.id === root.id) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });

  return ordered;
}

/**
 * Find the protocol row in `chain` whose `version` matches `pinned`.
 * Falls back to the root (chain[0]) when no exact match is found.
 * Returns null only when the chain is empty.
 */
export function resolvePinnedVersion(
  chain: Protocol[],
  pinned: string,
): Protocol | null {
  if (chain.length === 0) return null;
  for (const row of chain) {
    if (row.version === pinned) return row;
  }
  return chain[0];
}

/**
 * Normalize the parent for a bump: if the source row is itself a child,
 * the new revision should chain off the SAME root (so the tree stays
 * flat rather than becoming an unbounded chain). Returns the parent id
 * to use as `parent_protocol_id` on the new row.
 */
export function bumpParentFor(
  source: Pick<Protocol, 'id' | 'parentProtocolId'>,
): string {
  return source.parentProtocolId ?? source.id;
}

// ─── Validators / normalizers ──────────────────────────────────────────────

export function normalizeProtocolTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const tidy = raw.trim().toLowerCase().slice(0, 60);
    if (!tidy) continue;
    if (seen.has(tidy)) continue;
    seen.add(tidy);
    out.push(tidy);
    if (out.length >= 32) break;
  }
  return out;
}

export function normalizeAttachedUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const tidy = raw.trim();
    if (!tidy) continue;
    try {
      const u = new URL(tidy);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    } catch {
      continue;
    }
    if (seen.has(tidy)) continue;
    seen.add(tidy);
    out.push(tidy);
    if (out.length >= 32) break;
  }
  return out;
}

export function validateProtocolTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'title must be a string';
  const tidy = value.trim();
  if (!tidy) return 'title is required';
  if (tidy.length > 200) return 'title must be 200 characters or fewer';
  return null;
}

export function validateProtocolVersion(value: unknown): string | null {
  if (typeof value !== 'string') return 'version must be a string';
  const tidy = value.trim();
  if (!tidy) return 'version is required';
  if (tidy.length > 60) return 'version must be 60 characters or fewer';
  return null;
}

export function validateProtocolKind(value: unknown): string | null {
  if (asProtocolKind(value) == null) {
    return `kind must be one of: ${PROTOCOL_KINDS.join(', ')}`;
  }
  return null;
}
