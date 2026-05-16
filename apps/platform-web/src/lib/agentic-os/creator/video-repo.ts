/**
 * Creator OS Phase 5 — video assets DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A video id belonging to another user returns null on get /
 * update / delete.
 *
 * URL-only contract — no file handling, no ffmpeg, no transcoding.
 *
 * @license MIT — Tiresias Creator OS Phase 5 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCreatorPool } from './session';
import { recordAudit } from '../_shared/audit';
import type {
  CreatorVideoAsset,
  CreateVideoAssetInput,
  UpdateVideoAssetInput,
  ListVideoAssetsOpts,
} from './video';

const VIDEO_COLUMNS = `id, user_id, title, description, url,
                        thumbnail_url, duration_seconds,
                        status, created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

interface RawVideoRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  status: CreatorVideoAsset['status'];
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToVideo(row: RawVideoRow): CreatorVideoAsset {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description ?? null,
    url: row.url,
    thumbnailUrl: row.thumbnail_url ?? null,
    durationSeconds: row.duration_seconds ?? null,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listVideos(
  userId: string,
  opts: ListVideoAssetsOpts = {},
): Promise<CreatorVideoAsset[]> {
  const pool = getCreatorPool();
  const params: unknown[] = [userId];
  const where: string[] = [`user_id = $1`];

  if (opts.status) {
    params.push(opts.status);
    where.push(`status = $${params.length}`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${VIDEO_COLUMNS}
       FROM agos_creator_video_assets
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToVideo);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getVideo(
  id: string,
  userId: string,
): Promise<CreatorVideoAsset | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${VIDEO_COLUMNS}
       FROM agos_creator_video_assets
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToVideo(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createVideo(
  input: CreateVideoAssetInput,
  userId: string,
): Promise<CreatorVideoAsset> {
  const pool = getCreatorPool();
  const id = randomUUID();

  await pool.query(
    `INSERT INTO agos_creator_video_assets
       (id, user_id, title, description, url, thumbnail_url, duration_seconds, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      userId,
      input.title,
      input.description ?? null,
      input.url,
      input.thumbnailUrl ?? null,
      input.durationSeconds ?? null,
      input.status ?? 'ready',
    ],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.video.created',
    payload: { videoId: id, title: input.title },
  });

  const after = await getVideo(id, userId);
  if (!after) throw new Error('Failed to create video asset');
  return after;
}

// ─── Update ───────────────────────────────────────────────────────────────

export type UpdateVideoOutcome =
  | { kind: 'ok'; video: CreatorVideoAsset }
  | { kind: 'not_found' };

export async function updateVideo(
  id: string,
  userId: string,
  patch: UpdateVideoAssetInput,
): Promise<UpdateVideoOutcome> {
  const pool = getCreatorPool();
  const set: string[] = [];
  const params: unknown[] = [id, userId];
  let n = 2;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.description !== undefined) {
    params.push(patch.description);
    n += 1;
    set.push(`description = $${n}`);
  }
  if (patch.url !== undefined) {
    params.push(patch.url);
    n += 1;
    set.push(`url = $${n}`);
  }
  if (patch.thumbnailUrl !== undefined) {
    params.push(patch.thumbnailUrl);
    n += 1;
    set.push(`thumbnail_url = $${n}`);
  }
  if (patch.durationSeconds !== undefined) {
    params.push(patch.durationSeconds);
    n += 1;
    set.push(`duration_seconds = $${n}`);
  }
  if (patch.status !== undefined) {
    params.push(patch.status);
    n += 1;
    set.push(`status = $${n}`);
  }

  if (set.length === 0) {
    const current = await getVideo(id, userId);
    return current ? { kind: 'ok', video: current } : { kind: 'not_found' };
  }

  const r = await pool.query(
    `UPDATE agos_creator_video_assets
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };

  const after = await getVideo(id, userId);
  if (!after) return { kind: 'not_found' };

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.video.updated',
    payload: { videoId: id, fields: Object.keys(patch) },
  });

  return { kind: 'ok', video: after };
}

// ─── Publish ──────────────────────────────────────────────────────────────

export async function publishVideo(
  id: string,
  userId: string,
): Promise<CreatorVideoAsset | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `UPDATE agos_creator_video_assets
        SET status = 'ready'
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.video.published',
    payload: { videoId: id },
  });

  return getVideo(id, userId);
}

// ─── Archive ──────────────────────────────────────────────────────────────

export async function archiveVideo(
  id: string,
  userId: string,
): Promise<CreatorVideoAsset | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `UPDATE agos_creator_video_assets
        SET status = 'archived'
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.video.archived',
    payload: { videoId: id },
  });

  return getVideo(id, userId);
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function deleteVideo(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `DELETE FROM agos_creator_video_assets
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId],
  );

  const deleted = (r.rowCount ?? 0) > 0;
  if (deleted) {
    await recordAudit({
      pool,
      osSlug: 'creator',
      actorId: userId,
      action: 'creator.video.deleted',
      payload: { videoId: id },
    });
  }

  return deleted;
}
