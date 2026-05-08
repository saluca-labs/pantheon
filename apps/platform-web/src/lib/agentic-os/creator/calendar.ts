/**
 * Creator OS — Editorial Calendar domain logic.
 *
 * An editorial calendar is the canonical planning tool for content creators.
 * It tracks posts across channels with status, scheduled publish date, and
 * optional content format (article, video, podcast, etc.).
 *
 * Channel taxonomy is adapted from standard digital-marketing practice
 * (e.g., HubSpot Content Hub, Buffer, Later):
 *   https://www.hubspot.com/products/content
 *   https://buffer.com/resources/content-types/
 *
 * Post statuses mirror common CMS / publishing workflows (WordPress, Ghost,
 * Contentful):
 *   https://developer.wordpress.org/rest-api/reference/posts/#schema-status
 *
 * @license MIT — original work for Tiresias platform
 */

export const POST_STATUSES = ['idea', 'draft', 'scheduled', 'published', 'archived'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/**
 * Content channel taxonomy — matches common self-publishing platforms.
 * Reference: Buffer "Types of Content Marketing" guide
 * https://buffer.com/resources/content-types/
 */
export const CHANNELS = [
  'blog',
  'newsletter',
  'youtube',
  'tiktok',
  'instagram',
  'twitter_x',
  'linkedin',
  'podcast',
  'substack',
  'facebook',
  'other',
] as const;

export type Channel = (typeof CHANNELS)[number];

/**
 * Content format / media type taxonomy.
 */
export const CONTENT_FORMATS = [
  'article',
  'video',
  'short_video',
  'podcast_episode',
  'newsletter_issue',
  'image_post',
  'thread',
  'carousel',
  'other',
] as const;

export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export interface CalendarPost {
  id: string;
  userId: string;
  title: string;
  status: PostStatus;
  channel: Channel;
  contentFormat: ContentFormat;
  publishAt: string | null;
  body: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Validate a CalendarPost before persisting.
 * Returns human-readable error strings (empty list = valid).
 */
export function validatePost(data: Partial<Pick<CalendarPost, 'title' | 'status' | 'channel' | 'contentFormat' | 'publishAt'>>): string[] {
  const errors: string[] = [];
  if (!data.title || data.title.trim().length === 0) {
    errors.push('Post title is required.');
  }
  if (data.title && data.title.length > 255) {
    errors.push('Post title must be 255 characters or fewer.');
  }
  if (data.status && !(POST_STATUSES as readonly string[]).includes(data.status)) {
    errors.push(`Status "${data.status}" is not valid.`);
  }
  if (data.channel && !(CHANNELS as readonly string[]).includes(data.channel)) {
    errors.push(`Channel "${data.channel}" is not recognised.`);
  }
  if (data.contentFormat && !(CONTENT_FORMATS as readonly string[]).includes(data.contentFormat)) {
    errors.push(`Content format "${data.contentFormat}" is not recognised.`);
  }
  if (data.publishAt) {
    const d = new Date(data.publishAt);
    if (isNaN(d.getTime())) {
      errors.push('publishAt must be a valid ISO 8601 datetime.');
    }
  }
  return errors;
}

/**
 * Group posts by ISO week string (YYYY-WXX) for calendar display.
 */
export function groupByWeek(posts: CalendarPost[]): Map<string, CalendarPost[]> {
  const map = new Map<string, CalendarPost[]>();
  for (const post of posts) {
    const weekKey = post.publishAt ? isoWeek(new Date(post.publishAt)) : 'unscheduled';
    const bucket = map.get(weekKey) ?? [];
    bucket.push(post);
    map.set(weekKey, bucket);
  }
  return map;
}

/**
 * Return the ISO 8601 week string "YYYY-WXX" for a given Date.
 * Algorithm follows ISO 8601 § 4.3.2 (first week contains January 4th).
 */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // ISO: Mon=1…Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
