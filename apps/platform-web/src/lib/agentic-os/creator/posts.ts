/**
 * Creator OS Phase 2 — Publishing domain types.
 *
 * Posts are the primary publishing unit: blog articles, newsletter issues,
 * or any long-form written content destined for public consumption.
 *
 * Status taxonomy:
 *   idea      — captured but not yet worked on
 *   draft     — actively being written
 *   scheduled — draft complete, queued for future publish
 *   published — live (available via RSS / public page)
 *   archived  — soft-deleted, hidden from public view
 *
 * @license MIT — Tiresias Creator OS Phase 2 (internal).
 */

export const POST_STATUSES = [
  'idea',
  'draft',
  'scheduled',
  'published',
  'archived',
] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

export interface CreatorPost {
  id: string;
  userId: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: Record<string, unknown>; // TipTap JSON
  coverImageUrl: string | null;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  tags: string[];
  notesMd: string | null;
  publishAt: string | null; // legacy field from 0011, kept for calendar compat
  createdAt: string;
  updatedAt: string;
}

export interface CreateCreatorPostInput {
  title: string;
  slug?: string;
  excerpt?: string;
  content?: Record<string, unknown>;
  coverImageUrl?: string;
  status?: PostStatus;
  scheduledAt?: string;
  tags?: string[];
}

export interface UpdateCreatorPostInput {
  title?: string;
  slug?: string;
  excerpt?: string | null;
  content?: Record<string, unknown>;
  coverImageUrl?: string | null;
  status?: PostStatus;
  scheduledAt?: string | null;
  tags?: string[];
  notesMd?: string | null;
}

export interface ListCreatorPostsOpts {
  status?: PostStatus | PostStatus[];
  search?: string;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}
