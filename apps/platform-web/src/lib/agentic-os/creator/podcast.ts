/**
 * Creator OS Phase 4 — podcast domain types.
 *
 * URL-only contract: ``audio_file_url`` is a TEXT field holding a URL.
 * No file upload handling, no local filesystem writes.
 *
 * One podcast per user (UNIQUE on user_id).
 *
 * @license MIT — Tiresias Creator OS Phase 4 (internal).
 */

export const EPISODE_TYPES = ['full', 'trailer', 'bonus'] as const;
export type EpisodeType = (typeof EPISODE_TYPES)[number];

export const EPISODE_STATUSES = ['draft', 'published', 'archived'] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];

export interface CreatorPodcast {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  author: string | null;
  coverImageUrl: string | null;
  language: string;
  category: string | null;
  explicit: boolean;
  websiteUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorEpisode {
  id: string;
  podcastId: string;
  title: string;
  description: string | null;
  notesMd: string | null;
  audioFileUrl: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeType: EpisodeType;
  status: EpisodeStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPodcastInput {
  title: string;
  description?: string;
  author?: string;
  coverImageUrl?: string;
  language?: string;
  category?: string;
  explicit?: boolean;
  websiteUrl?: string;
}

export interface CreateEpisodeInput {
  title: string;
  description?: string;
  notesMd?: string;
  audioFileUrl?: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
  mimeType?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeType?: EpisodeType;
}

export interface UpdateEpisodeInput {
  title?: string;
  description?: string | null;
  notesMd?: string | null;
  audioFileUrl?: string | null;
  durationSeconds?: number | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  episodeType?: EpisodeType;
  status?: EpisodeStatus;
}

export interface ListEpisodesOpts {
  seasonNumber?: number;
  status?: EpisodeStatus;
  limit?: number;
  offset?: number;
}
