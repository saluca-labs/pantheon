/**
 * Maker OS — unit tests for log.ts (Phase 3 build-log helpers).
 *
 * Covers:
 *   - ATTACHED_URL_KINDS enum + labels.
 *   - validateLogBody, validateAttachedUrl(s), validateAttachedUrlKind.
 *   - validateUrlString accepts http/https/path-rooted, rejects others.
 *   - coerceAttachedUrls drops invalid entries silently.
 *   - parseUrlInput parses comma- and newline-separated entries with
 *     optional |kind and |kind|label suffixes.
 *   - inferKindFromUrl recognises common image / video / file patterns.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  ATTACHED_URL_KINDS,
  ATTACHED_URL_KIND_LABELS,
  coerceAttachedUrls,
  inferKindFromUrl,
  parseUrlInput,
  validateAttachedUrl,
  validateAttachedUrlKind,
  validateAttachedUrls,
  validateLogBody,
  validateUrlString,
} from '@/lib/agentic-os/maker/log';

describe('ATTACHED_URL_KINDS + labels', () => {
  it('contains the 4 locked kinds', () => {
    expect(ATTACHED_URL_KINDS).toEqual(['photo', 'video', 'link', 'file']);
  });

  it('every kind has a label', () => {
    for (const k of ATTACHED_URL_KINDS) {
      expect(ATTACHED_URL_KIND_LABELS[k]).toBeTruthy();
    }
  });
});

describe('validateLogBody', () => {
  it('accepts normal text', () => {
    expect(validateLogBody('Cut all 4 panels today.')).toBeNull();
  });

  it('rejects empty / whitespace', () => {
    expect(validateLogBody('')).toMatch(/required/);
    expect(validateLogBody('   ')).toMatch(/required/);
  });

  it('rejects > 4000 characters', () => {
    expect(validateLogBody('x'.repeat(4001))).toMatch(/4000/);
  });

  it('rejects non-string', () => {
    expect(validateLogBody(123 as any)).toMatch(/string/);
  });
});

describe('validateAttachedUrlKind', () => {
  it('accepts every locked kind', () => {
    for (const k of ATTACHED_URL_KINDS) {
      expect(validateAttachedUrlKind(k)).toBeNull();
    }
  });

  it('rejects unknown kinds', () => {
    expect(validateAttachedUrlKind('audio')).toMatch(/kind must be one of/);
    expect(validateAttachedUrlKind('')).toMatch(/kind must be one of/);
    expect(validateAttachedUrlKind(null)).toMatch(/kind must be one of/);
  });
});

describe('validateUrlString', () => {
  it('accepts http and https URLs', () => {
    expect(validateUrlString('http://example.com')).toBeNull();
    expect(validateUrlString('https://example.com/path?q=1')).toBeNull();
  });

  it('accepts root-relative paths', () => {
    expect(validateUrlString('/uploads/photo.jpg')).toBeNull();
  });

  it('rejects empty / whitespace', () => {
    expect(validateUrlString('')).toMatch(/required/);
    expect(validateUrlString('   ')).toMatch(/required/);
  });

  it('rejects > 2000 chars', () => {
    expect(validateUrlString(`https://${'x'.repeat(2001)}`)).toMatch(/2000/);
  });

  it('rejects javascript:, ftp:, mailto:, etc.', () => {
    expect(validateUrlString('javascript:alert(1)')).toMatch(/http|https|\//);
    expect(validateUrlString('ftp://x')).toMatch(/http|https|\//);
    expect(validateUrlString('mailto:a@b.c')).toMatch(/http|https|\//);
    expect(validateUrlString('plainstring')).toMatch(/http|https|\//);
  });

  it('rejects non-string', () => {
    expect(validateUrlString(123 as any)).toMatch(/string/);
  });
});

describe('validateAttachedUrl', () => {
  it('accepts a valid entry', () => {
    expect(
      validateAttachedUrl({ url: 'https://example.com/x.jpg', kind: 'photo' }),
    ).toBeNull();
  });

  it('accepts a valid entry with optional label', () => {
    expect(
      validateAttachedUrl({
        url: 'https://example.com/x.jpg',
        kind: 'photo',
        label: 'Frame 1',
      }),
    ).toBeNull();
  });

  it('rejects missing url', () => {
    expect(validateAttachedUrl({ kind: 'photo' })).toMatch(/string/);
  });

  it('rejects invalid kind', () => {
    expect(
      validateAttachedUrl({ url: 'https://example.com', kind: 'audio' }),
    ).toMatch(/kind/);
  });

  it('rejects non-object', () => {
    expect(validateAttachedUrl(null)).toMatch(/object/);
    expect(validateAttachedUrl('https://x.com')).toMatch(/object/);
  });

  it('rejects label > 200 chars', () => {
    expect(
      validateAttachedUrl({
        url: 'https://example.com',
        kind: 'link',
        label: 'x'.repeat(201),
      }),
    ).toMatch(/200/);
  });
});

describe('validateAttachedUrls', () => {
  it('accepts null / undefined / empty as no attachments', () => {
    expect(validateAttachedUrls(null)).toBeNull();
    expect(validateAttachedUrls(undefined)).toBeNull();
    expect(validateAttachedUrls([])).toBeNull();
  });

  it('accepts mixed kinds', () => {
    expect(
      validateAttachedUrls([
        { url: 'https://a/1.jpg', kind: 'photo' },
        { url: 'https://b/v.mp4', kind: 'video' },
        { url: 'https://c', kind: 'link' },
        { url: 'https://d/x.pdf', kind: 'file' },
      ]),
    ).toBeNull();
  });

  it('rejects non-array', () => {
    expect(validateAttachedUrls('https://x')).toMatch(/array/);
  });

  it('rejects > 25 entries', () => {
    const arr = Array.from({ length: 26 }, () => ({
      url: 'https://x.com',
      kind: 'link' as const,
    }));
    expect(validateAttachedUrls(arr)).toMatch(/25/);
  });

  it('surfaces the first bad entry error', () => {
    expect(
      validateAttachedUrls([
        { url: 'https://a', kind: 'photo' },
        { url: 'not-a-url', kind: 'link' },
      ]),
    ).toMatch(/http|https|\//);
  });
});

describe('coerceAttachedUrls', () => {
  it('drops invalid entries silently', () => {
    const out = coerceAttachedUrls([
      { url: 'https://a/1.jpg', kind: 'photo' },
      { url: 'bad', kind: 'photo' }, // bad scheme
      { url: 'https://b', kind: 'wrong' }, // bad kind
      { url: 'https://c', kind: 'link', label: 'OK' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.url).toBe('https://a/1.jpg');
    expect(out[1]!.label).toBe('OK');
  });

  it('returns [] for non-array input', () => {
    expect(coerceAttachedUrls(null)).toEqual([]);
    expect(coerceAttachedUrls('https://x')).toEqual([]);
    expect(coerceAttachedUrls(undefined)).toEqual([]);
  });
});

describe('inferKindFromUrl', () => {
  it('detects photo extensions', () => {
    expect(inferKindFromUrl('https://x/foo.jpg')).toBe('photo');
    expect(inferKindFromUrl('https://x/foo.png?w=200')).toBe('photo');
    expect(inferKindFromUrl('https://x/foo.WEBP')).toBe('photo');
  });

  it('detects video extensions and known hosts', () => {
    expect(inferKindFromUrl('https://x/movie.mp4')).toBe('video');
    expect(inferKindFromUrl('https://youtu.be/abc')).toBe('video');
    expect(inferKindFromUrl('https://www.youtube.com/watch?v=abc')).toBe('video');
  });

  it('detects file-ish extensions', () => {
    expect(inferKindFromUrl('https://x/doc.pdf')).toBe('file');
    expect(inferKindFromUrl('https://x/part.stl')).toBe('file');
    expect(inferKindFromUrl('https://x/bundle.zip')).toBe('file');
  });

  it('defaults to link', () => {
    expect(inferKindFromUrl('https://example.com/article')).toBe('link');
  });
});

describe('parseUrlInput', () => {
  it('returns an empty array for empty input', () => {
    expect(parseUrlInput('')).toEqual([]);
    expect(parseUrlInput('   ')).toEqual([]);
  });

  it('parses a single URL with inferred kind', () => {
    const out = parseUrlInput('https://example.com/photo.jpg');
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('photo');
  });

  it('parses comma- and newline-separated URLs', () => {
    const out = parseUrlInput('https://a/1.jpg, https://b/2.mp4\nhttps://c');
    expect(out.map((u) => u.kind)).toEqual(['photo', 'video', 'link']);
  });

  it('honours explicit kind suffix', () => {
    const out = parseUrlInput('https://example.com|file');
    expect(out[0]!.kind).toBe('file');
  });

  it('honours explicit kind + label suffix', () => {
    const out = parseUrlInput('https://example.com|link|Cool article');
    expect(out[0]!.kind).toBe('link');
    expect(out[0]!.label).toBe('Cool article');
  });

  it('drops entries with invalid URLs', () => {
    const out = parseUrlInput('https://ok.com, javascript:alert(1)');
    expect(out).toHaveLength(1);
  });

  it('falls back to inferred kind when suffix is unknown', () => {
    const out = parseUrlInput('https://x/foo.png|audio');
    expect(out[0]!.kind).toBe('photo');
  });
});
