/**
 * Research OS Phase 5 — protocols DB repository.
 *
 * Protocols are workshop-global with a version-history self-reference
 * via `parent_protocol_id`. NO FK on parent_protocol_id so soft
 * tree-walks survive a delete of an intermediate node.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import {
  PROTOCOL_KINDS,
  asProtocolKind,
  type ProtocolKind,
} from './protocol-kinds';
import {
  bumpParentFor,
  type Protocol,
  type CreateProtocolInput,
  type UpdateProtocolInput,
  type BumpProtocolInput,
  type ProtocolsListOpts,
} from './protocols';

const PROTOCOL_COLUMNS = `id, user_id, title, version, body_md, kind,
                          attached_urls, tags, parent_protocol_id, metadata,
                          created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

interface RawProtocolRow {
  id: string;
  user_id: string;
  title: string;
  version: string;
  body_md: string | null;
  kind: string;
  attached_urls: string[] | null;
  tags: string[] | null;
  parent_protocol_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToProtocol(row: RawProtocolRow): Protocol {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    version: row.version,
    bodyMd: row.body_md ?? '',
    kind: (asProtocolKind(row.kind) ?? 'method'),
    attachedUrls: Array.isArray(row.attached_urls) ? row.attached_urls : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    parentProtocolId: row.parent_protocol_id ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── Ownership probe ──────────────────────────────────────────────────────

export async function isProtocolOwnedByUser(
  protocolId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_research_protocols
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [protocolId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listProtocols(
  userId: string,
  opts: ProtocolsListOpts = {},
): Promise<Protocol[]> {
  const pool = getResearchPool();
  const params: unknown[] = [userId];
  const where: string[] = [`p.user_id = $1`];

  if (opts.kind !== undefined) {
    if (!(PROTOCOL_KINDS as readonly string[]).includes(opts.kind)) {
      throw new Error(`Invalid protocol kind filter: ${opts.kind}`);
    }
    params.push(opts.kind);
    where.push(`p.kind = $${params.length}`);
  }

  if (opts.tag && opts.tag.trim()) {
    params.push(opts.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(p.tags)`);
  }

  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim()}%`);
    where.push(`p.title ILIKE $${params.length}`);
  }

  // Default: list root rows only. The library page shows one card per
  // tree; revision history surfaces on the detail page.
  if (opts.rootsOnly !== false) {
    where.push(`p.parent_protocol_id IS NULL`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${PROTOCOL_COLUMNS}
       FROM agos_research_protocols p
      WHERE ${where.join(' AND ')}
      ORDER BY p.updated_at DESC, p.created_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToProtocol);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getProtocol(
  protocolId: string,
  userId: string,
): Promise<Protocol | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${PROTOCOL_COLUMNS}
       FROM agos_research_protocols p
      WHERE p.id = $1 AND p.user_id = $2
      LIMIT 1`,
    [protocolId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToProtocol(r.rows[0]);
}

// ─── Get tree ─────────────────────────────────────────────────────────────

/**
 * Fetch all rows that share a tree with the supplied protocol id.
 * Walks up to the root first, then collects every descendant. Used by
 * the protocol detail page (version history) and by the experiment-
 * protocols pin loader (chain + version match).
 */
export async function getProtocolTree(
  protocolId: string,
  userId: string,
): Promise<Protocol[]> {
  const pool = getResearchPool();

  // First, walk up to the root id. Postgres recursive CTE handles this
  // in a single round-trip — and tolerates the NO-FK parent pointer
  // because the join only requires the pointed-at row to exist within
  // the same user_id scope.
  const r = await pool.query(
    `WITH RECURSIVE ancestors AS (
       SELECT p.id, p.parent_protocol_id
         FROM agos_research_protocols p
        WHERE p.id = $1 AND p.user_id = $2
       UNION
       SELECT p2.id, p2.parent_protocol_id
         FROM agos_research_protocols p2
         JOIN ancestors a ON a.parent_protocol_id = p2.id
        WHERE p2.user_id = $2
     ),
     root AS (
       SELECT id FROM ancestors WHERE parent_protocol_id IS NULL
        LIMIT 1
     ),
     descendants AS (
       SELECT p.id FROM agos_research_protocols p, root
        WHERE p.id = root.id AND p.user_id = $2
       UNION
       SELECT p.id
         FROM agos_research_protocols p
         JOIN descendants d ON p.parent_protocol_id = d.id
        WHERE p.user_id = $2
     )
     SELECT ${PROTOCOL_COLUMNS}
       FROM agos_research_protocols p
      WHERE p.id IN (SELECT id FROM descendants)
        AND p.user_id = $2
      ORDER BY p.created_at ASC`,
    [protocolId, userId],
  );
  return r.rows.map(rowToProtocol);
}

// ─── Create root ──────────────────────────────────────────────────────────

export async function createProtocol(
  userId: string,
  data: CreateProtocolInput,
): Promise<Protocol> {
  const pool = getResearchPool();
  const kind: ProtocolKind = data.kind ?? 'method';
  if (!(PROTOCOL_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Invalid protocol kind: ${kind}`);
  }
  const id = randomUUID();
  const version = data.version ?? '1.0';
  await pool.query(
    `INSERT INTO agos_research_protocols
       (id, user_id, title, version, body_md, kind, attached_urls, tags,
        parent_protocol_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8::text[],$9,$10::jsonb)`,
    [
      id,
      userId,
      data.title,
      version,
      data.bodyMd ?? '',
      kind,
      data.attachedUrls ?? [],
      data.tags ?? [],
      data.parentProtocolId ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const row = await getProtocol(id, userId);
  if (!row) throw new Error('Failed to create protocol');
  return row;
}

// ─── Bump version ─────────────────────────────────────────────────────────

/**
 * Create a new revision row pointing back to `sourceId`. The new row's
 * `parent_protocol_id` is the root of the tree (we normalize via
 * `bumpParentFor` so chains stay flat — descendant of root, not chain
 * of children).
 *
 * Returns the new row, or null if the source doesn't exist for this
 * user.
 */
export async function bumpProtocolVersion(
  sourceId: string,
  userId: string,
  data: BumpProtocolInput,
): Promise<Protocol | null> {
  const source = await getProtocol(sourceId, userId);
  if (!source) return null;

  const pool = getResearchPool();
  const id = randomUUID();
  const parentForNew = bumpParentFor(source);
  await pool.query(
    `INSERT INTO agos_research_protocols
       (id, user_id, title, version, body_md, kind, attached_urls, tags,
        parent_protocol_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8::text[],$9,$10::jsonb)`,
    [
      id,
      userId,
      source.title,
      data.version,
      data.bodyMd,
      source.kind,
      source.attachedUrls,
      source.tags,
      parentForNew,
      JSON.stringify({
        ...source.metadata,
        bumpedFromId: source.id,
        bumpedFromVersion: source.version,
        bumpNotes: data.notes ?? null,
      }),
    ],
  );
  return getProtocol(id, userId);
}

// ─── Update ───────────────────────────────────────────────────────────────

export async function updateProtocol(
  protocolId: string,
  userId: string,
  patch: UpdateProtocolInput,
): Promise<Protocol | null> {
  const pool = getResearchPool();
  if (
    patch.kind !== undefined &&
    !(PROTOCOL_KINDS as readonly string[]).includes(patch.kind)
  ) {
    throw new Error(`Invalid protocol kind: ${patch.kind}`);
  }
  const set: string[] = [];
  const params: unknown[] = [protocolId, userId];
  let n = 2;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.version !== undefined) {
    params.push(patch.version);
    n += 1;
    set.push(`version = $${n}`);
  }
  if (patch.bodyMd !== undefined) {
    params.push(patch.bodyMd);
    n += 1;
    set.push(`body_md = $${n}`);
  }
  if (patch.kind !== undefined) {
    params.push(patch.kind);
    n += 1;
    set.push(`kind = $${n}`);
  }
  if (patch.attachedUrls !== undefined) {
    params.push(patch.attachedUrls);
    n += 1;
    set.push(`attached_urls = $${n}::text[]`);
  }
  if (patch.tags !== undefined) {
    params.push(patch.tags);
    n += 1;
    set.push(`tags = $${n}::text[]`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  if (set.length === 0) {
    return getProtocol(protocolId, userId);
  }
  set.push(`updated_at = now()`);

  const r = await pool.query(
    `UPDATE agos_research_protocols p
        SET ${set.join(', ')}
      WHERE p.id = $1 AND p.user_id = $2
      RETURNING p.id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getProtocol(protocolId, userId);
}

// ─── Delete ───────────────────────────────────────────────────────────────

/**
 * Hard delete. Because parent_protocol_id has NO FK, deleting an
 * intermediate row leaves descendants intact (their pointers become
 * orphan, walker falls back to the row itself as the local root).
 *
 * The experiment_protocols join FK CASCADE removes any pins.
 */
export async function deleteProtocol(
  protocolId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_protocols
      WHERE id = $1 AND user_id = $2`,
    [protocolId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}
