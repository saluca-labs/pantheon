/**
 * Creator OS Phase 5 — Video library domain types.
 *
 * URL-only contract: `url` holds an HLS manifest URL.
 * No file upload, no ffmpeg, no transcoding in this phase.
 *
 * @license MIT — Tiresias Creator OS Phase 5 (internal).
 */

export const VIDEO_STATUSES = ['processing', 'ready', 'failed'] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export interface CreatorVideoAsset {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  url: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  status: VideoStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVideoAssetInput {
  title: string;
  description?: string;
  url: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  status?: VideoStatus;
}

export interface UpdateVideoAssetInput {
  title?: string;
  description?: string | null;
  url?: string;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  status?: VideoStatus;
}

export interface ListVideoAssetsOpts {
  status?: VideoStatus;
  limit?: number;
  offset?: number;
}
