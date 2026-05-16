/**
 * Creator OS Phase 4 — podcast DB repository.
 *
 * Cross-ownership contract: every read / write filters by ownership via
 * JOIN with the podcasts table. An episode belonging to another user
 * returns null on get / update / delete.
 *
 * One podcast per user (UNIQUE on user_id). Upsert semantics for show config.
 *
 * @license MIT — Tiresias Creator OS Phase 4 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCreatorPool } from './session';
import { recordAudit } from '../_shared/audit';
import type {
  CreatorPodcast,
  CreatorEpisode,
  UpsertPodcastInput,
  CreateEpisodeInput,
  UpdateEpisodeInput,
  ListEpisodesOpts,
} from './podcast';

// ─── Row parsers ───────────────────────────────────────────────────────────

const PODCAST_COLUMNS = `id, user_id, title, description, author,
                          cover_image_url, language, category, explicit,
                          website_url, created_at, updated_at`;

const EPISODE_COLUMNS = `id, podcast_id, title, description, notes_md,
                          audio_file_url, duration_seconds, file_size_bytes,
                          mime_type, season_number, episode_number,
                          episode_type, status, published_at,
                          created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

interface RawPodcastRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  author: string | null;
  cover_image_url: string | null;
  language: string | null;
  category: string | null;
  explicit: boolean | null;
  website_url: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawEpisodeRow {
  id: string;
  podcast_id: string;
  title: string;
  description: string | null;
  notes_md: string | null;
  audio_file_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  season_number: number | null;
  episode_number: number | null;
  episode_type: CreatorEpisode['episodeType'] | null;
  status: CreatorEpisode['status'] | null;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToPodcast(row: RawPodcastRow): CreatorPodcast {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description ?? null,
    author: row.author ?? null,
    coverImageUrl: row.cover_image_url ?? null,
    language: row.language ?? 'en',
    category: row.category ?? null,
    explicit: Boolean(row.explicit),
    websiteUrl: row.website_url ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToEpisode(row: RawEpisodeRow): CreatorEpisode {
  return {
    id: row.id,
    podcastId: row.podcast_id,
    title: row.title,
    description: row.description ?? null,
    notesMd: row.notes_md ?? null,
    audioFileUrl: row.audio_file_url ?? null,
    durationSeconds: row.duration_seconds ?? null,
    fileSizeBytes: row.file_size_bytes ?? null,
    mimeType: row.mime_type ?? null,
    seasonNumber: row.season_number ?? null,
    episodeNumber: row.episode_number ?? null,
    episodeType: row.episode_type ?? 'full',
    status: row.status ?? 'draft',
    publishedAt: toIsoOrNull(row.published_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── Podcast show ──────────────────────────────────────────────────────────

export async function getPodcast(userId: string): Promise<CreatorPodcast | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT ${PODCAST_COLUMNS}
       FROM agos_creator_podcasts
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToPodcast(r.rows[0]);
}

export async function upsertPodcast(
  input: UpsertPodcastInput,
  userId: string,
): Promise<CreatorPodcast> {
  const pool = getCreatorPool();
  const existing = await getPodcast(userId);

  await pool.query(
    `INSERT INTO agos_creator_podcasts
       (id, user_id, title, description, author, cover_image_url,
        language, category, explicit, website_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id) DO UPDATE SET
       title         = EXCLUDED.title,
       description   = EXCLUDED.description,
       author        = EXCLUDED.author,
       cover_image_url = EXCLUDED.cover_image_url,
       language      = EXCLUDED.language,
       category      = EXCLUDED.category,
       explicit      = EXCLUDED.explicit,
       website_url   = EXCLUDED.website_url`,
    [
      existing?.id ?? randomUUID(),
      userId,
      input.title,
      input.description ?? null,
      input.author ?? null,
      input.coverImageUrl ?? null,
      input.language ?? 'en',
      input.category ?? null,
      input.explicit ?? false,
      input.websiteUrl ?? null,
    ],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: existing ? 'creator.podcast.updated' : 'creator.podcast.created',
    payload: { title: input.title },
  });

  const after = await getPodcast(userId);
  if (!after) throw new Error('Failed to upsert podcast');
  return after;
}

// ─── Episodes: list ────────────────────────────────────────────────────────

export async function listEpisodes(
  userId: string,
  opts: ListEpisodesOpts = {},
): Promise<CreatorEpisode[]> {
  const pool = getCreatorPool();
  const params: unknown[] = [userId];
  const where: string[] = [`p.user_id = $1`];

  if (opts.seasonNumber !== undefined) {
    params.push(opts.seasonNumber);
    where.push(`e.season_number = $${params.length}`);
  }

  if (opts.status !== undefined) {
    params.push(opts.status);
    where.push(`e.status = $${params.length}`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT e.id, e.podcast_id, e.title, e.description, e.notes_md,
            e.audio_file_url, e.duration_seconds, e.file_size_bytes,
            e.mime_type, e.season_number, e.episode_number,
            e.episode_type, e.status, e.published_at,
            e.created_at, e.updated_at
       FROM agos_creator_episodes e
       JOIN agos_creator_podcasts p ON p.id = e.podcast_id
      WHERE ${where.join(' AND ')}
      ORDER BY e.season_number DESC NULLS LAST, e.episode_number DESC NULLS LAST
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToEpisode);
}

// ─── Episodes: get one ─────────────────────────────────────────────────────

export async function getEpisode(
  episodeId: string,
  userId: string,
): Promise<CreatorEpisode | null> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `SELECT e.id, e.podcast_id, e.title, e.description, e.notes_md,
            e.audio_file_url, e.duration_seconds, e.file_size_bytes,
            e.mime_type, e.season_number, e.episode_number,
            e.episode_type, e.status, e.published_at,
            e.created_at, e.updated_at
       FROM agos_creator_episodes e
       JOIN agos_creator_podcasts p ON p.id = e.podcast_id
      WHERE e.id = $1 AND p.user_id = $2
      LIMIT 1`,
    [episodeId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToEpisode(r.rows[0]);
}

// ─── Episodes: create ──────────────────────────────────────────────────────

export async function createEpisode(
  input: CreateEpisodeInput,
  userId: string,
): Promise<CreatorEpisode> {
  const pool = getCreatorPool();

  // Resolve podcast ownership
  const podcast = await getPodcast(userId);
  if (!podcast) throw new Error('No podcast configured');

  // Auto-increment episode_number
  let episodeNumber = input.episodeNumber;
  if (episodeNumber === undefined) {
    const mr = await pool.query(
      `SELECT COALESCE(MAX(episode_number), 0) + 1 AS next
         FROM agos_creator_episodes
        WHERE podcast_id = $1`,
      [podcast.id],
    );
    episodeNumber = Number(mr.rows[0]?.next ?? 1);
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_creator_episodes
       (id, podcast_id, title, description, notes_md,
        audio_file_url, duration_seconds, file_size_bytes,
        mime_type, season_number, episode_number, episode_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      podcast.id,
      input.title,
      input.description ?? null,
      input.notesMd ?? null,
      input.audioFileUrl ?? null,
      input.durationSeconds ?? null,
      input.fileSizeBytes ?? null,
      input.mimeType ?? null,
      input.seasonNumber ?? null,
      episodeNumber,
      input.episodeType ?? 'full',
    ],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.episode.created',
    payload: { episodeId: id, title: input.title },
  });

  const after = await getEpisode(id, userId);
  if (!after) throw new Error('Failed to create episode');
  return after;
}

// ─── Episodes: update ──────────────────────────────────────────────────────

export type UpdateEpisodeOutcome =
  | { kind: 'ok'; episode: CreatorEpisode }
  | { kind: 'not_found' };

export async function updateEpisode(
  episodeId: string,
  userId: string,
  patch: UpdateEpisodeInput,
): Promise<UpdateEpisodeOutcome> {
  const pool = getCreatorPool();

  // Verify ownership first
  const existing = await pool.query(
    `SELECT e.id
       FROM agos_creator_episodes e
       JOIN agos_creator_podcasts p ON p.id = e.podcast_id
      WHERE e.id = $1 AND p.user_id = $2
      LIMIT 1`,
    [episodeId, userId],
  );
  if ((existing.rowCount ?? 0) === 0) return { kind: 'not_found' };

  const set: string[] = [];
  const params: unknown[] = [episodeId];
  let n = 1;

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
  if (patch.notesMd !== undefined) {
    params.push(patch.notesMd);
    n += 1;
    set.push(`notes_md = $${n}`);
  }
  if (patch.audioFileUrl !== undefined) {
    params.push(patch.audioFileUrl);
    n += 1;
    set.push(`audio_file_url = $${n}`);
  }
  if (patch.durationSeconds !== undefined) {
    params.push(patch.durationSeconds);
    n += 1;
    set.push(`duration_seconds = $${n}`);
  }
  if (patch.fileSizeBytes !== undefined) {
    params.push(patch.fileSizeBytes);
    n += 1;
    set.push(`file_size_bytes = $${n}`);
  }
  if (patch.mimeType !== undefined) {
    params.push(patch.mimeType);
    n += 1;
    set.push(`mime_type = $${n}`);
  }
  if (patch.seasonNumber !== undefined) {
    params.push(patch.seasonNumber);
    n += 1;
    set.push(`season_number = $${n}`);
  }
  if (patch.episodeNumber !== undefined) {
    params.push(patch.episodeNumber);
    n += 1;
    set.push(`episode_number = $${n}`);
  }
  if (patch.episodeType !== undefined) {
    params.push(patch.episodeType);
    n += 1;
    set.push(`episode_type = $${n}`);
  }
  if (patch.status !== undefined) {
    params.push(patch.status);
    n += 1;
    set.push(`status = $${n}`);
  }

  if (set.length === 0) {
    const current = await getEpisode(episodeId, userId);
    return current ? { kind: 'ok', episode: current } : { kind: 'not_found' };
  }

  await pool.query(
    `UPDATE agos_creator_episodes
        SET ${set.join(', ')}
      WHERE id = $1`,
    params,
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.episode.updated',
    payload: { episodeId, fields: Object.keys(patch) },
  });

  const after = await getEpisode(episodeId, userId);
  if (!after) return { kind: 'not_found' };

  return { kind: 'ok', episode: after };
}

// ─── Episodes: publish ─────────────────────────────────────────────────────

export async function publishEpisode(
  episodeId: string,
  userId: string,
): Promise<CreatorEpisode | null> {
  const pool = getCreatorPool();

  const existing = await pool.query(
    `SELECT e.id
       FROM agos_creator_episodes e
       JOIN agos_creator_podcasts p ON p.id = e.podcast_id
      WHERE e.id = $1 AND p.user_id = $2
        AND e.status = 'draft'
      LIMIT 1`,
    [episodeId, userId],
  );
  if ((existing.rowCount ?? 0) === 0) return null;

  await pool.query(
    `UPDATE agos_creator_episodes
        SET status = 'published',
            published_at = COALESCE(published_at, now())
      WHERE id = $1`,
    [episodeId],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.episode.published',
    payload: { episodeId },
  });

  return getEpisode(episodeId, userId);
}

// ─── Episodes: archive ─────────────────────────────────────────────────────

export async function archiveEpisode(
  episodeId: string,
  userId: string,
): Promise<CreatorEpisode | null> {
  const pool = getCreatorPool();

  const existing = await pool.query(
    `SELECT e.id
       FROM agos_creator_episodes e
       JOIN agos_creator_podcasts p ON p.id = e.podcast_id
      WHERE e.id = $1 AND p.user_id = $2
      LIMIT 1`,
    [episodeId, userId],
  );
  if ((existing.rowCount ?? 0) === 0) return null;

  await pool.query(
    `UPDATE agos_creator_episodes
        SET status = 'archived'
      WHERE id = $1`,
    [episodeId],
  );

  await recordAudit({
    pool,
    osSlug: 'creator',
    actorId: userId,
    action: 'creator.episode.archived',
    payload: { episodeId },
  });

  return getEpisode(episodeId, userId);
}

// ─── Episodes: delete ──────────────────────────────────────────────────────

export async function deleteEpisode(
  episodeId: string,
  userId: string,
): Promise<boolean> {
  const pool = getCreatorPool();
  const r = await pool.query(
    `DELETE FROM agos_creator_episodes e
      USING agos_creator_podcasts p
      WHERE e.id = $1
        AND e.podcast_id = p.id
        AND p.user_id = $2
      RETURNING e.id`,
    [episodeId, userId],
  );

  const deleted = (r.rowCount ?? 0) > 0;
  if (deleted) {
    await recordAudit({
      pool,
      osSlug: 'creator',
      actorId: userId,
      action: 'creator.episode.deleted',
      payload: { episodeId },
    });
  }

  return deleted;
}
