/**
 * Research OS Phase 5 — experiment-protocols (with version pinning) repo.
 *
 * Cross-ownership
 * ---------------
 * The join row's `experiment_id` carries NO FK (platform v0.1.30); the
 * `protocol_id` FK CASCADE → protocols. Ownership of BOTH sides is
 * enforced by EXISTS clauses against `agos_research_experiments` +
 * `agos_research_protocols` filtered by `user_id`.
 *
 * UNIQUE constraint on (experiment_id, protocol_id, pinned_version) —
 * INSERT catches SQLSTATE 23505 and surfaces `{kind: 'duplicate'}` for
 * 409 translation. Different pinned versions for the same (exp,
 * protocol) pair are allowed.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import {
  asProtocolKind,
  type ProtocolKind,
} from './protocol-kinds';
import {
  resolvePinnedVersion,
  type Protocol,
} from './protocols';
import {
  getProtocol,
  getProtocolTree,
} from './protocols-repo';
import type {
  ExperimentProtocolLink,
  LinkedProtocolPin,
  CreateExperimentProtocolInput,
  UpdateExperimentProtocolInput,
} from './experiment-protocols';

const LINK_COLUMNS = `id, experiment_id, protocol_id, pinned_version, notes, created_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function rowToLink(row: any): ExperimentProtocolLink {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    protocolId: row.protocol_id,
    pinnedVersion: row.pinned_version,
    notes: row.notes ?? null,
    createdAt: toIso(row.created_at),
  };
}

function rowToProtocol(row: any): Protocol {
  return {
    id: row.p_id,
    userId: row.p_user_id,
    title: row.p_title,
    version: row.p_version,
    bodyMd: row.p_body_md ?? '',
    kind: (asProtocolKind(row.p_kind) ?? 'method') as ProtocolKind,
    attachedUrls: Array.isArray(row.p_attached_urls) ? row.p_attached_urls : [],
    tags: Array.isArray(row.p_tags) ? row.p_tags : [],
    parentProtocolId: row.p_parent_protocol_id ?? null,
    metadata: (row.p_metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.p_created_at),
    updatedAt: toIso(row.p_updated_at),
  };
}

// ─── Ownership probes ─────────────────────────────────────────────────────

export async function isExperimentOwnedByUser(
  experimentId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_research_experiments
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [experimentId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

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

// ─── List for experiment ──────────────────────────────────────────────────

export async function listProtocolsForExperiment(
  experimentId: string,
  userId: string,
): Promise<LinkedProtocolPin[]> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ep.id, ep.experiment_id, ep.protocol_id, ep.pinned_version, ep.notes, ep.created_at,
            p.id                  AS p_id,
            p.user_id             AS p_user_id,
            p.title               AS p_title,
            p.version             AS p_version,
            p.body_md             AS p_body_md,
            p.kind                AS p_kind,
            p.attached_urls       AS p_attached_urls,
            p.tags                AS p_tags,
            p.parent_protocol_id  AS p_parent_protocol_id,
            p.metadata            AS p_metadata,
            p.created_at          AS p_created_at,
            p.updated_at          AS p_updated_at
       FROM agos_research_experiment_protocols ep
       JOIN agos_research_protocols p ON p.id = ep.protocol_id
      WHERE ep.experiment_id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = ep.experiment_id AND e.user_id = $2
            )
        AND p.user_id = $2
      ORDER BY ep.created_at ASC`,
    [experimentId, userId],
  );

  // Resolve each pin's exact version by walking the protocol's tree.
  const pins: LinkedProtocolPin[] = [];
  for (const row of r.rows) {
    const protocol = rowToProtocol(row);
    const link = rowToLink({
      id: row.id,
      experiment_id: row.experiment_id,
      protocol_id: row.protocol_id,
      pinned_version: row.pinned_version,
      notes: row.notes,
      created_at: row.created_at,
    });
    const tree = await getProtocolTree(protocol.id, userId);
    const resolved = resolvePinnedVersion(tree, link.pinnedVersion) ?? protocol;
    pins.push({ link, protocol, resolved });
  }
  return pins;
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getExperimentProtocolLink(
  experimentId: string,
  protocolId: string,
  userId: string,
): Promise<ExperimentProtocolLink | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${LINK_COLUMNS}
       FROM agos_research_experiment_protocols ep
      WHERE ep.experiment_id = $1
        AND ep.protocol_id   = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = ep.experiment_id AND e.user_id = $3
            )
        AND EXISTS (
              SELECT 1 FROM agos_research_protocols p
               WHERE p.id = ep.protocol_id AND p.user_id = $3
            )
      ORDER BY ep.created_at DESC
      LIMIT 1`,
    [experimentId, protocolId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToLink(r.rows[0]);
}

// ─── Pin / create ─────────────────────────────────────────────────────────

export type PinOutcome =
  | { kind: 'ok'; link: ExperimentProtocolLink }
  | { kind: 'duplicate' };

export async function pinProtocolToExperiment(
  experimentId: string,
  userId: string,
  data: CreateExperimentProtocolInput,
): Promise<PinOutcome> {
  // If pinned_version omitted, default to the protocol's CURRENT version
  // — this is the most natural pin: "pin the methods I just wrote".
  let pinnedVersion = data.pinnedVersion;
  if (!pinnedVersion) {
    const proto = await getProtocol(data.protocolId, userId);
    if (!proto) {
      // The route layer probes for protocol ownership before calling
      // us; reaching here means the protocol disappeared mid-flight.
      return { kind: 'duplicate' };
    }
    pinnedVersion = proto.version;
  }

  const pool = getResearchPool();
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO agos_research_experiment_protocols
         (id, experiment_id, protocol_id, pinned_version, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, experimentId, data.protocolId, pinnedVersion, data.notes ?? null],
    );
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === '23505') return { kind: 'duplicate' };
    throw err;
  }
  const link = await getExperimentProtocolLinkById(id, userId);
  if (!link) return { kind: 'duplicate' };
  return { kind: 'ok', link };
}

export async function getExperimentProtocolLinkById(
  linkId: string,
  userId: string,
): Promise<ExperimentProtocolLink | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${LINK_COLUMNS}
       FROM agos_research_experiment_protocols ep
      WHERE ep.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = ep.experiment_id AND e.user_id = $2
            )
        AND EXISTS (
              SELECT 1 FROM agos_research_protocols p
               WHERE p.id = ep.protocol_id AND p.user_id = $2
            )`,
    [linkId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToLink(r.rows[0]);
}

// ─── Update notes ─────────────────────────────────────────────────────────

export async function updateExperimentProtocolNotes(
  experimentId: string,
  protocolId: string,
  userId: string,
  patch: UpdateExperimentProtocolInput,
): Promise<ExperimentProtocolLink | null> {
  // PATCH is notes-only (pin is immutable per spec — to repin, unpin + repin).
  if (patch.notes === undefined) {
    return getExperimentProtocolLink(experimentId, protocolId, userId);
  }
  const pool = getResearchPool();
  const r = await pool.query(
    `UPDATE agos_research_experiment_protocols ep
        SET notes = $4
      WHERE ep.experiment_id = $1
        AND ep.protocol_id   = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = ep.experiment_id AND e.user_id = $3
            )
        AND EXISTS (
              SELECT 1 FROM agos_research_protocols p
               WHERE p.id = ep.protocol_id AND p.user_id = $3
            )
      RETURNING ep.id`,
    [experimentId, protocolId, userId, patch.notes],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getExperimentProtocolLink(experimentId, protocolId, userId);
}

// ─── Unpin / delete ───────────────────────────────────────────────────────

export async function unpinProtocolFromExperiment(
  experimentId: string,
  protocolId: string,
  userId: string,
): Promise<number> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_experiment_protocols ep
      WHERE ep.experiment_id = $1
        AND ep.protocol_id   = $2
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = ep.experiment_id AND e.user_id = $3
            )
        AND EXISTS (
              SELECT 1 FROM agos_research_protocols p
               WHERE p.id = ep.protocol_id AND p.user_id = $3
            )`,
    [experimentId, protocolId, userId],
  );
  return r.rowCount ?? 0;
}

// ─── Counts ───────────────────────────────────────────────────────────────

export async function countProtocolPinsForExperiment(
  experimentId: string,
  userId: string,
): Promise<number> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM agos_research_experiment_protocols ep
      WHERE ep.experiment_id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = ep.experiment_id AND e.user_id = $2
            )`,
    [experimentId, userId],
  );
  return (r.rows[0]?.n as number) ?? 0;
}
