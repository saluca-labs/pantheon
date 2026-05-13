/**
 * Creator OS coach — per-mode context snapshot.
 *
 * Loads a compact, current-state view for one session. The shape varies
 * by mode so the model isn't given a full creator dump every turn:
 *
 *   - content_strategist: recent posts + notes + books + calendar posts.
 *   - writing_coach: scoped post or book draft + recent published work.
 *   - audience_builder: subscriber stats + post performance + recent posts.
 *   - monetization_advisor: pricing info + books/products + subscriber stats.
 *   - general: subscriber summary + post count + note count + book count
 *     + upcoming calendar count.
 *
 * The size cap (`MAX_CONTEXT_BYTES`) is enforced after rendering to JSON
 * so a pathological content payload can't blow the model's context window.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

import 'server-only';
import { listPosts } from '../posts-repo';
import { listNotes } from '../notes-repo';
import { listBooks } from '../books-repo';
import { listSubscribers } from '../subscribers-repo';
import type { CoachMode } from './modes';

/** Hard cap on the rendered JSON size (50 KB pre-prompt). Truncate beyond. */
export const MAX_CONTEXT_BYTES = 50_000;

// ─── Shared types ──────────────────────────────────────────────────────────

export interface CoachPostSummary {
  id: string;
  title: string;
  status: string;
  categories: string[];
  excerpt: string | null;
  published_at: string | null;
  content?: unknown;
}

export interface CoachNoteSummary {
  id: string;
  title: string;
  updated_at: string;
}

export interface CoachBookSummary {
  id: string;
  title: string;
  status: string;
  word_count: number | null;
  description: string | null;
}

// ─── Mode-specific context types ───────────────────────────────────────────

export interface CoachStrategistContext {
  recent_posts: CoachPostSummary[];
  recent_notes: CoachNoteSummary[];
  books: CoachBookSummary[];
}

export interface CoachWritingContext {
  scoped_post: CoachPostSummary | null;
  scoped_book: CoachBookSummary | null;
  recent_posts: CoachPostSummary[];
}

export interface CoachAudienceContext {
  subscriber_stats: {
    total: number;
    active: number;
    unsubscribed: number;
  };
  post_performance: CoachPostSummary[];
  recent_posts: CoachPostSummary[];
}

export interface CoachMonetizationContext {
  pricing_info: Record<string, unknown>;
  books: CoachBookSummary[];
  subscriber_stats: {
    total: number;
    active: number;
  };
}

export interface CoachGeneralContext {
  subscriber_stats: {
    total: number;
    active: number;
  };
  recent_posts: CoachPostSummary[];
  recent_notes: CoachNoteSummary[];
  books: CoachBookSummary[];
}

export type CreatorCoachContext =
  | { mode: 'content_strategist'; data: CoachStrategistContext }
  | { mode: 'writing_coach'; data: CoachWritingContext }
  | { mode: 'audience_builder'; data: CoachAudienceContext }
  | { mode: 'monetization_advisor'; data: CoachMonetizationContext }
  | { mode: 'general'; data: CoachGeneralContext };

export interface BuildCoachContextInput {
  userId: string;
  mode: CoachMode;
}

// ─── Truncation helpers ────────────────────────────────────────────────────

export function enforceContextSizeCap(payload: unknown): unknown {
  const initial = JSON.stringify(payload);
  if (initial.length <= MAX_CONTEXT_BYTES) return payload;

  const clone = JSON.parse(initial);
  const containers = collectArrayContainers(clone);
  containers.sort((a, b) => b.array.length - a.array.length);
  for (const container of containers) {
    while (
      container.array.length > 0 &&
      JSON.stringify(clone).length > MAX_CONTEXT_BYTES
    ) {
      container.array.pop();
      container.truncated = true;
    }
    if (container.truncated) {
      container.parent[container.key] = {
        _truncated: true,
        _kept: container.array.length,
        items: container.array,
      };
    }
    if (JSON.stringify(clone).length <= MAX_CONTEXT_BYTES) break;
  }
  return clone;
}

interface ArrayContainer {
  parent: any;
  key: string;
  array: any[];
  truncated: boolean;
}

function collectArrayContainers(node: any, into: ArrayContainer[] = []): ArrayContainer[] {
  if (node == null || typeof node !== 'object') return into;
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      into.push({ parent: node, key, array: value, truncated: false });
    } else if (value && typeof value === 'object') {
      collectArrayContainers(value, into);
    }
  }
  return into;
}

// ─── Pure mapping helpers ─────────────────────────────────────────────────

function mapPost(p: any): CoachPostSummary {
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    categories: p.tags ?? [],
    excerpt: p.excerpt ?? null,
    published_at: p.publishedAt ?? null,
    content: p.content ?? undefined,
  };
}

function mapNote(n: any): CoachNoteSummary {
  return {
    id: n.id,
    title: n.title,
    updated_at: n.updatedAt,
  };
}

function mapBook(b: any): CoachBookSummary {
  return {
    id: b.id,
    title: b.title,
    status: b.status,
    word_count: b.wordCount ?? null,
    description: b.description ?? null,
  };
}

// ─── Content strategist loader ─────────────────────────────────────────────

async function loadStrategist(userId: string): Promise<CoachStrategistContext> {
  const [posts, notes, books] = await Promise.all([
    listPosts(userId, { limit: 30 }),
    listNotes(userId).catch(() => []),
    listBooks(userId),
  ]);

  return {
    recent_posts: posts.slice(0, 15).map(mapPost),
    recent_notes: (Array.isArray(notes) ? notes.slice(0, 10) : []).map(mapNote),
    books: books.slice(0, 5).map(mapBook),
  };
}

// ─── Writing coach loader ──────────────────────────────────────────────────

async function loadWriting(userId: string): Promise<CoachWritingContext> {
  const posts = await listPosts(userId, { limit: 30 });

  // Find the most recent draft for scoping
  const drafts = posts.filter((p) => p.status === 'draft');
  const scopedPost = drafts.length > 0 ? mapPost(drafts[0]) : null;

  // Include content from the draft for writing feedback
  if (scopedPost && drafts[0].content) {
    scopedPost.content = drafts[0].content;
  }

  const publishedPosts = posts
    .filter((p) => p.status === 'published')
    .slice(0, 5)
    .map(mapPost);

  const books = await listBooks(userId).catch(() => []);
  const bookList = Array.isArray(books) ? books : [];
  const bookDrafts = bookList.filter((b: any) => b.status === 'draft');
  const scopedBook = bookDrafts.length > 0 ? mapBook(bookDrafts[0]) : null;

  return {
    scoped_post: scopedPost,
    scoped_book: scopedBook,
    recent_posts: publishedPosts,
  };
}

// ─── Audience builder loader ───────────────────────────────────────────────

async function loadAudience(userId: string): Promise<CoachAudienceContext> {
  const [subscribers, posts] = await Promise.all([
    listSubscribers(userId).catch(() => []),
    listPosts(userId, { limit: 30 }),
  ]);

  const subscriberList = Array.isArray(subscribers) ? subscribers : [];
  const active = subscriberList.filter((s: any) => s.status === 'active').length;
  const unsubscribed = subscriberList.filter((s: any) => s.status === 'unsubscribed').length;

  const publishedPosts = posts
    .filter((p) => p.status === 'published')
    .slice(0, 10)
    .map(mapPost);

  return {
    subscriber_stats: {
      total: subscriberList.length,
      active,
      unsubscribed,
    },
    post_performance: publishedPosts,
    recent_posts: posts.slice(0, 5).map(mapPost),
  };
}

// ─── Monetization advisor loader ───────────────────────────────────────────

async function loadMonetization(userId: string): Promise<CoachMonetizationContext> {
  const [subscribers, books] = await Promise.all([
    listSubscribers(userId).catch(() => []),
    listBooks(userId).catch(() => []),
  ]);

  const subscriberList = Array.isArray(subscribers) ? subscribers : [];
  const active = subscriberList.filter((s: any) => s.status === 'active').length;

  return {
    pricing_info: {},
    books: (Array.isArray(books) ? books.slice(0, 5) : []).map(mapBook),
    subscriber_stats: {
      total: subscriberList.length,
      active,
    },
  };
}

// ─── General loader ────────────────────────────────────────────────────────

async function loadGeneral(userId: string): Promise<CoachGeneralContext> {
  const [subscribers, posts, notes, books] = await Promise.all([
    listSubscribers(userId).catch(() => []),
    listPosts(userId, { limit: 10 }),
    listNotes(userId).catch(() => []),
    listBooks(userId).catch(() => []),
  ]);

  const subscriberList = Array.isArray(subscribers) ? subscribers : [];
  const active = subscriberList.filter((s: any) => s.status === 'active').length;

  return {
    subscriber_stats: {
      total: subscriberList.length,
      active,
    },
    recent_posts: posts.slice(0, 5).map(mapPost),
    recent_notes: (Array.isArray(notes) ? notes.slice(0, 5) : []).map(mapNote),
    books: (Array.isArray(books) ? books.slice(0, 5) : []).map(mapBook),
  };
}

// ─── Main orchestrator ─────────────────────────────────────────────────────

export async function buildCoachContext(
  input: BuildCoachContextInput,
): Promise<CreatorCoachContext> {
  switch (input.mode) {
    case 'content_strategist': {
      const data = await loadStrategist(input.userId);
      return {
        mode: 'content_strategist',
        data: enforceContextSizeCap(data) as CoachStrategistContext,
      };
    }
    case 'writing_coach': {
      const data = await loadWriting(input.userId);
      return {
        mode: 'writing_coach',
        data: enforceContextSizeCap(data) as CoachWritingContext,
      };
    }
    case 'audience_builder': {
      const data = await loadAudience(input.userId);
      return {
        mode: 'audience_builder',
        data: enforceContextSizeCap(data) as CoachAudienceContext,
      };
    }
    case 'monetization_advisor': {
      const data = await loadMonetization(input.userId);
      return {
        mode: 'monetization_advisor',
        data: enforceContextSizeCap(data) as CoachMonetizationContext,
      };
    }
    case 'general': {
      const data = await loadGeneral(input.userId);
      return {
        mode: 'general',
        data: enforceContextSizeCap(data) as CoachGeneralContext,
      };
    }
  }
}
