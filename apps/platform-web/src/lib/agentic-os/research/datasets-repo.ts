/**
 * Research OS Phase 5 — datasets DB repository.
 *
 * Cross-ownership
 * ---------------
 * `agos_research_datasets.experiment_id` carries NO FK (platform
 * v0.1.30); ownership is enforced by EXISTS clauses against
 * `agos_research_experiments` filtered by `user_id`. The `user_id`
 * column on the dataset row mirrors the parent experiment's user_id;
 * the route layer writes them together so both filters succeed.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import {
  DATASET_KINDS,
  asDatasetKind,
  type DatasetKind,
} from './dataset-kinds';
import type {
  Dataset,
  CreateDatasetInput,
  UpdateDatasetInput,
  DatasetsListOpts,
} from './datasets';

const DATASET_COLUMNS = `id, user_id, experiment_id, name, kind, url, version,
                         size_bytes, checksum, archived, published_doi, notes_md,
                         tags, metadata, created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function rowToDataset(row: any): Dataset {
  return {
    id: row.id,
    userId: row.user_id,
    experimentId: row.experiment_id,
    name: row.name,
    kind: (asDatasetKind(row.kind) ?? 'tabular'),
    url: row.url,
    version: row.version ?? null,
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    checksum: row.checksum ?? null,
    archived: Boolean(row.archived),
    publishedDoi: row.published_doi ?? null,
    notesMd: row.notes_md ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── Ownership probe ──────────────────────────────────────────────────────

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

// ─── List ─────────────────────────────────────────────────────────────────

export async function listDatasetsForExperiment(
  experimentId: string,
  userId: string,
  opts: DatasetsListOpts = {},
): Promise<Dataset[]> {
  const pool = getResearchPool();
  const params: any[] = [experimentId, userId];
  const where: string[] = [
    `d.experiment_id = $1`,
    `EXISTS (
       SELECT 1 FROM agos_research_experiments e
        WHERE e.id = d.experiment_id AND e.user_id = $2
     )`,
  ];

  if (opts.kind !== undefined) {
    if (!(DATASET_KINDS as readonly string[]).includes(opts.kind)) {
      throw new Error(`Invalid dataset kind filter: ${opts.kind}`);
    }
    params.push(opts.kind);
    where.push(`d.kind = $${params.length}`);
  }

  if (opts.archived !== undefined) {
    params.push(opts.archived);
    where.push(`d.archived = $${params.length}`);
  }

  if (opts.tag && opts.tag.trim()) {
    params.push(opts.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(d.tags)`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${DATASET_COLUMNS}
       FROM agos_research_datasets d
      WHERE ${where.join(' AND ')}
      ORDER BY d.updated_at DESC, d.created_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToDataset);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getDataset(
  datasetId: string,
  userId: string,
): Promise<Dataset | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${DATASET_COLUMNS}
       FROM agos_research_datasets d
      WHERE d.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = d.experiment_id AND e.user_id = $2
            )
      LIMIT 1`,
    [datasetId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToDataset(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createDataset(
  experimentId: string,
  userId: string,
  data: CreateDatasetInput,
): Promise<Dataset> {
  const pool = getResearchPool();
  const kind: DatasetKind = data.kind ?? 'tabular';
  if (!(DATASET_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Invalid dataset kind: ${kind}`);
  }
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_research_datasets
       (id, user_id, experiment_id, name, kind, url, version, size_bytes,
        checksum, archived, published_doi, notes_md, tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text[],$14::jsonb)`,
    [
      id,
      userId,
      experimentId,
      data.name,
      kind,
      data.url,
      data.version ?? null,
      data.sizeBytes ?? null,
      data.checksum ?? null,
      data.archived ?? false,
      data.publishedDoi ?? null,
      data.notesMd ?? null,
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const row = await getDataset(id, userId);
  if (!row) throw new Error('Failed to create dataset');
  return row;
}

// ─── Update ───────────────────────────────────────────────────────────────

export async function updateDataset(
  datasetId: string,
  userId: string,
  patch: UpdateDatasetInput,
): Promise<Dataset | null> {
  const pool = getResearchPool();
  if (
    patch.kind !== undefined &&
    !(DATASET_KINDS as readonly string[]).includes(patch.kind)
  ) {
    throw new Error(`Invalid dataset kind: ${patch.kind}`);
  }

  const set: string[] = [];
  const params: any[] = [datasetId, userId];
  let n = 2;

  if (patch.name !== undefined) {
    params.push(patch.name);
    n += 1;
    set.push(`name = $${n}`);
  }
  if (patch.kind !== undefined) {
    params.push(patch.kind);
    n += 1;
    set.push(`kind = $${n}`);
  }
  if (patch.url !== undefined) {
    params.push(patch.url);
    n += 1;
    set.push(`url = $${n}`);
  }
  if (patch.version !== undefined) {
    params.push(patch.version);
    n += 1;
    set.push(`version = $${n}`);
  }
  if (patch.sizeBytes !== undefined) {
    params.push(patch.sizeBytes);
    n += 1;
    set.push(`size_bytes = $${n}`);
  }
  if (patch.checksum !== undefined) {
    params.push(patch.checksum);
    n += 1;
    set.push(`checksum = $${n}`);
  }
  if (patch.archived !== undefined) {
    params.push(patch.archived);
    n += 1;
    set.push(`archived = $${n}`);
  }
  if (patch.publishedDoi !== undefined) {
    params.push(patch.publishedDoi);
    n += 1;
    set.push(`published_doi = $${n}`);
  }
  if (patch.notesMd !== undefined) {
    params.push(patch.notesMd);
    n += 1;
    set.push(`notes_md = $${n}`);
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
    return getDataset(datasetId, userId);
  }
  set.push(`updated_at = now()`);

  const r = await pool.query(
    `UPDATE agos_research_datasets d
        SET ${set.join(', ')}
      WHERE d.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = d.experiment_id AND e.user_id = $2
            )
      RETURNING d.id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getDataset(datasetId, userId);
}

// ─── Delete ───────────────────────────────────────────────────────────────

/**
 * Hard delete. Datasets are pointer rows; the underlying bytes live
 * elsewhere (per the MCP storage-transfer contract), so removing the
 * pointer row is the natural lifecycle action. The `archived` flag is
 * an external-archive marker, NOT a soft-delete.
 */
export async function deleteDataset(
  datasetId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_datasets d
      WHERE d.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = d.experiment_id AND e.user_id = $2
            )`,
    [datasetId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Counts ───────────────────────────────────────────────────────────────

export async function countDatasetsForExperiment(
  experimentId: string,
  userId: string,
): Promise<number> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM agos_research_datasets d
      WHERE d.experiment_id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = d.experiment_id AND e.user_id = $2
            )`,
    [experimentId, userId],
  );
  return (r.rows[0]?.n as number) ?? 0;
}
