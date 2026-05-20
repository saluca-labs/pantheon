/**
 * Creator OS Phase 3 — Book writing domain types.
 *
 * @license MIT — Tiresias Creator OS Phase 3 (internal).
 */

export const BOOK_STATUSES = ['draft', 'writing', 'complete', 'published'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const CHAPTER_STATUSES = ['draft', 'revised', 'final'] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export interface CreatorBook {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  status: BookStatus;
  subtitle: string | null;
  authorDisplayName: string | null;
  copyrightYear: number | null;
  language: string;
  dedication: string | null;
  aboutAuthor: string | null;
  seriesName: string | null;
  seriesPosition: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorChapter {
  id: string;
  bookId: string;
  title: string;
  content: Record<string, unknown>; // TipTap JSON
  order: number;
  wordCount: number;
  status: ChapterStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCreatorBookInput {
  title: string;
  description?: string;
  coverImageUrl?: string;
  subtitle?: string;
  authorDisplayName?: string;
  copyrightYear?: number;
  language?: string;
  dedication?: string;
  aboutAuthor?: string;
  seriesName?: string;
  seriesPosition?: number;
}

export interface UpdateCreatorBookInput {
  title?: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status?: BookStatus;
  subtitle?: string | null;
  authorDisplayName?: string | null;
  copyrightYear?: number | null;
  language?: string;
  dedication?: string | null;
  aboutAuthor?: string | null;
  seriesName?: string | null;
  seriesPosition?: number | null;
}

export interface CreateCreatorChapterInput {
  title: string;
  content?: Record<string, unknown>;
}

export interface UpdateCreatorChapterInput {
  title?: string;
  content?: Record<string, unknown>;
  order?: number;
  wordCount?: number;
  status?: ChapterStatus;
}
