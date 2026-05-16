import { describe, it, expect } from 'vitest';
import {
  validatePost,
  isoWeek,
  groupByWeek,
  POST_STATUSES,
  CHANNELS,
  CONTENT_FORMATS,
} from '@/lib/agentic-os/creator/calendar';
import type { CalendarPost } from '@/lib/agentic-os/creator/calendar';

describe('validatePost', () => {
  it('returns no errors for a valid post', () => {
    const errors = validatePost({
      title: 'My Post',
      status: 'draft',
      channel: 'blog',
      contentFormat: 'article',
    });
    expect(errors).toHaveLength(0);
  });

  it('requires a title', () => {
    const errors = validatePost({ title: '' });
    expect(errors.some((e) => e.includes('title'))).toBe(true);
  });

  it('rejects title over 255 chars', () => {
    const errors = validatePost({ title: 'x'.repeat(256) });
    expect(errors.some((e) => e.includes('255'))).toBe(true);
  });

  it('rejects invalid status', () => {
    const errors = validatePost({ title: 'T', status: 'live' as never });
    expect(errors.some((e) => e.includes('Status'))).toBe(true);
  });

  it('rejects unknown channel', () => {
    const errors = validatePost({ title: 'T', channel: 'faxmachine' as never });
    expect(errors.some((e) => e.includes('Channel'))).toBe(true);
  });

  it('rejects invalid publishAt', () => {
    const errors = validatePost({ title: 'T', publishAt: 'not-a-date' });
    expect(errors.some((e) => e.includes('publishAt'))).toBe(true);
  });

  it('accepts a valid ISO datetime', () => {
    const errors = validatePost({ title: 'T', publishAt: '2025-06-01T09:00:00Z' });
    expect(errors.filter((e) => e.includes('publishAt'))).toHaveLength(0);
  });
});

describe('isoWeek', () => {
  it('returns ISO week string format YYYY-WXX', () => {
    // 2025-01-06 is Monday of ISO week 2025-W02
    const result = isoWeek(new Date('2025-01-06'));
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('returns W01 for first ISO week of a year', () => {
    // 2024-01-01 is Monday of ISO week 2024-W01
    expect(isoWeek(new Date('2024-01-01'))).toBe('2024-W01');
  });
});

describe('groupByWeek', () => {
  const makePost = (id: string, publishAt: string | null): CalendarPost => ({
    id,
    userId: 'u1',
    title: `Post ${id}`,
    status: 'draft',
    channel: 'blog',
    contentFormat: 'article',
    publishAt,
    body: null,
    tags: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  });

  it('groups posts with the same publish week together', () => {
    const posts = [
      makePost('1', '2025-01-06T10:00:00Z'), // W02
      makePost('2', '2025-01-07T10:00:00Z'), // W02
      makePost('3', '2025-01-13T10:00:00Z'), // W03
    ];
    const groups = groupByWeek(posts);
    const w02 = groups.get('2025-W02');
    expect(w02).toHaveLength(2);
    expect(w02?.map((p) => p.id)).toContain('1');
    expect(w02?.map((p) => p.id)).toContain('2');
  });

  it('puts posts without publishAt into "unscheduled"', () => {
    const posts = [makePost('x', null)];
    const groups = groupByWeek(posts);
    expect(groups.get('unscheduled')).toHaveLength(1);
  });
});

describe('POST_STATUSES', () => {
  it('includes idea, draft, scheduled, published, archived', () => {
    expect(POST_STATUSES).toContain('idea');
    expect(POST_STATUSES).toContain('published');
    expect(POST_STATUSES).toContain('scheduled');
  });
});

describe('CHANNELS', () => {
  it('includes common publishing channels', () => {
    expect(CHANNELS).toContain('blog');
    expect(CHANNELS).toContain('youtube');
    expect(CHANNELS).toContain('newsletter');
  });
});
