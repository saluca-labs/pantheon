/**
 * Creator OS — Export-presets + pre-flight tests.
 *
 * Covers preset construction per platform/trim, the geometry math
 * being passed to pandoc, the ePub metadata YAML shape, and the
 * pre-flight validator firing the right blockers/warnings per book +
 * target state.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  TRIM_GEOMETRIES,
  buildPreset,
  buildPandocMetadata,
} from '@/lib/agentic-os/creator/export-presets';
import { preflight } from '@/lib/agentic-os/creator/preflight';
import type { CreatorBook, CreatorChapter } from '@/lib/agentic-os/creator/books';
import type { PublishingTarget } from '@/lib/agentic-os/creator/publishing-targets';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function mkBook(overrides: Partial<CreatorBook> = {}): CreatorBook {
  return {
    id: 'b-1',
    userId: 'u-1',
    title: 'A Book',
    description: null,
    coverImageUrl: null,
    status: 'writing',
    subtitle: null,
    authorDisplayName: 'A. Author',
    copyrightYear: 2026,
    language: 'en-US',
    dedication: null,
    aboutAuthor: null,
    seriesName: null,
    seriesPosition: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkChapter(overrides: Partial<CreatorChapter> = {}): CreatorChapter {
  return {
    id: 'c-1',
    bookId: 'b-1',
    title: 'Chapter 1',
    content: {},
    order: 0,
    wordCount: 1000,
    status: 'draft',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkTarget(overrides: Partial<PublishingTarget> = {}): PublishingTarget {
  return {
    id: 't-1',
    bookId: 'b-1',
    platform: 'kdp_paperback',
    format: 'paperback',
    trimSize: '6x9',
    isbn: null,
    bisacCodes: [],
    priceUsd: null,
    status: 'draft',
    notes: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── TRIM_GEOMETRIES ─────────────────────────────────────────────────────────

describe('TRIM_GEOMETRIES', () => {
  it('covers the canonical KDP/Lulu trim sizes', () => {
    for (const size of ['5x8', '5.25x8', '5.5x8.5', '6x9', '7x10', '8.5x11']) {
      expect(TRIM_GEOMETRIES[size]).toBeDefined();
    }
  });

  it('keeps width < height (portrait) for all entries', () => {
    for (const trim of Object.values(TRIM_GEOMETRIES)) {
      expect(trim.widthIn).toBeLessThan(trim.heightIn);
    }
  });

  it('keeps inside margin >= outside (gutter must be larger)', () => {
    for (const trim of Object.values(TRIM_GEOMETRIES)) {
      expect(trim.insideIn).toBeGreaterThanOrEqual(trim.outsideIn);
    }
  });
});

// ─── buildPreset ─────────────────────────────────────────────────────────────

describe('buildPreset', () => {
  it('produces xelatex args with the trim geometry for paperback', () => {
    const preset = buildPreset({
      platform: 'kdp_paperback',
      format: 'paperback',
      trim: TRIM_GEOMETRIES['6x9'],
    });
    expect(preset.output).toBe('pdf');
    expect(preset.pandocArgs).toContain('--pdf-engine=xelatex');
    expect(preset.pandocArgs.join(' ')).toMatch(/paperwidth=6in/);
    expect(preset.pandocArgs.join(' ')).toMatch(/paperheight=9in/);
    expect(preset.pandocArgs.join(' ')).toMatch(/inner=0\.75in/);
    expect(preset.pandocArgs.join(' ')).toMatch(/classoption:twoside/);
  });

  it('uses epub3 args for ebook regardless of platform', () => {
    const preset = buildPreset({ platform: 'kdp_ebook', format: 'ebook' });
    expect(preset.output).toBe('epub');
    expect(preset.pandocArgs).toContain('--to=epub3');
    expect(preset.pandocArgs).toContain('--toc');
  });

  it('throws when trim is missing for paperback', () => {
    expect(() =>
      buildPreset({ platform: 'kdp_paperback', format: 'paperback' }),
    ).toThrow(/trim geometry required/i);
  });

  it('surfaces IngramSpark PDF/X-1a caveat as a preset note', () => {
    const preset = buildPreset({
      platform: 'ingramspark_paperback',
      format: 'paperback',
      trim: TRIM_GEOMETRIES['6x9'],
    });
    expect(preset.notes.join(' ')).toMatch(/PDF\/X-1a/);
  });
});

// ─── buildPandocMetadata ─────────────────────────────────────────────────────

describe('buildPandocMetadata', () => {
  it('emits a YAML frontmatter block with title and language', () => {
    const yaml = buildPandocMetadata({
      title: 'My Book',
      subtitle: null,
      authorDisplayName: 'Author Name',
      isbn: null,
      language: 'en-US',
      bisacCodes: [],
      copyrightYear: null,
      coverImageUrl: null,
    });
    expect(yaml).toMatch(/^---\n/);
    expect(yaml).toMatch(/title: My Book/);
    expect(yaml).toMatch(/author: Author Name/);
    expect(yaml).toMatch(/lang: en-US/);
    expect(yaml).toMatch(/\n---$/);
  });

  it('emits ISBN as identifier with scheme', () => {
    const yaml = buildPandocMetadata({
      title: 'T',
      subtitle: null,
      authorDisplayName: 'A',
      isbn: '978-0-13-468599-1',
      language: 'en-US',
      bisacCodes: [],
      copyrightYear: null,
      coverImageUrl: null,
    });
    expect(yaml).toMatch(/identifier:/);
    expect(yaml).toMatch(/scheme: ISBN/);
    expect(yaml).toMatch(/text: 978-0-13-468599-1/);
  });

  it('emits BISAC codes as subject list', () => {
    const yaml = buildPandocMetadata({
      title: 'T',
      subtitle: null,
      authorDisplayName: 'A',
      isbn: null,
      language: 'en-US',
      bisacCodes: ['COM051000', 'BUS020000'],
      copyrightYear: null,
      coverImageUrl: null,
    });
    expect(yaml).toMatch(/subject:\n {2}- COM051000\n {2}- BUS020000/);
  });

  it('quotes titles containing colons (YAML safety)', () => {
    const yaml = buildPandocMetadata({
      title: 'Subtitle: Here',
      subtitle: null,
      authorDisplayName: null,
      isbn: null,
      language: 'en-US',
      bisacCodes: [],
      copyrightYear: null,
      coverImageUrl: null,
    });
    expect(yaml).toMatch(/title: "Subtitle: Here"/);
  });
});

// ─── preflight ───────────────────────────────────────────────────────────────

describe('preflight', () => {
  it('blocks when the book has no chapters', () => {
    const r = preflight({
      book: mkBook(),
      chapters: [],
      target: mkTarget(),
      mode: 'draft',
    });
    expect(r.ok).toBe(false);
    expect(r.blockers.find((b) => b.code === 'NO_CHAPTERS')).toBeDefined();
  });

  it('blocks when all chapters are empty', () => {
    const r = preflight({
      book: mkBook(),
      chapters: [mkChapter({ wordCount: 0 })],
      target: mkTarget(),
      mode: 'draft',
    });
    expect(r.blockers.find((b) => b.code === 'EMPTY_CHAPTERS')).toBeDefined();
  });

  it('passes draft mode with chapters + content even without ISBN', () => {
    const r = preflight({
      book: mkBook(),
      chapters: [mkChapter()],
      target: mkTarget({ isbn: null }),
      mode: 'draft',
    });
    expect(r.ok).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('blocks publish_ready when ISBN is missing', () => {
    const r = preflight({
      book: mkBook(),
      chapters: [mkChapter()],
      target: mkTarget({ isbn: null }),
      mode: 'publish_ready',
    });
    expect(r.ok).toBe(false);
    expect(r.blockers.find((b) => b.code === 'ISBN_MISSING')).toBeDefined();
  });

  it('blocks publish_ready when ISBN fails checksum', () => {
    const r = preflight({
      book: mkBook(),
      chapters: [mkChapter()],
      target: mkTarget({ isbn: '978-0-13-468599-2' }),
      mode: 'publish_ready',
    });
    expect(r.blockers.find((b) => b.code === 'ISBN_INVALID')).toBeDefined();
  });

  it('blocks publish_ready ebook without coverImageUrl', () => {
    const r = preflight({
      book: mkBook({ coverImageUrl: null }),
      chapters: [mkChapter()],
      target: mkTarget({
        platform: 'kdp_ebook',
        format: 'ebook',
        trimSize: null,
        isbn: '978-0-13-468599-1',
      }),
      mode: 'publish_ready',
    });
    expect(r.blockers.find((b) => b.code === 'COVER_MISSING')).toBeDefined();
  });

  it('blocks paperback without trim size', () => {
    const r = preflight({
      book: mkBook(),
      chapters: [mkChapter()],
      target: mkTarget({ trimSize: null }),
      mode: 'draft',
    });
    expect(r.blockers.find((b) => b.code === 'TRIM_MISSING')).toBeDefined();
  });

  it('warns on unknown trim size', () => {
    const r = preflight({
      book: mkBook(),
      chapters: [mkChapter()],
      target: mkTarget({ trimSize: '9.99x12.34' }),
      mode: 'draft',
    });
    expect(r.warnings.find((w) => w.code === 'TRIM_UNKNOWN')).toBeDefined();
  });

  it('warns on IngramSpark publish_ready (PDF/X-1a caveat)', () => {
    const r = preflight({
      book: mkBook(),
      chapters: [mkChapter()],
      target: mkTarget({
        platform: 'ingramspark_paperback',
        isbn: '978-0-13-468599-1',
      }),
      mode: 'publish_ready',
    });
    expect(r.warnings.find((w) => w.code === 'INGRAMSPARK_PDFX')).toBeDefined();
  });

  it('warns when BISAC codes are empty', () => {
    const r = preflight({
      book: mkBook(),
      chapters: [mkChapter()],
      target: mkTarget({ bisacCodes: [] }),
      mode: 'draft',
    });
    expect(r.warnings.find((w) => w.code === 'BISAC_MISSING')).toBeDefined();
  });

  it('full happy path: publish_ready paperback with everything filled', () => {
    const r = preflight({
      book: mkBook(),
      chapters: [mkChapter()],
      target: mkTarget({
        isbn: '978-0-13-468599-1',
        bisacCodes: ['COM051000'],
        priceUsd: 14.99,
      }),
      mode: 'publish_ready',
    });
    expect(r.ok).toBe(true);
    // Should still carry the even-page-count reminder warning, not a blocker
    expect(r.warnings.find((w) => w.code === 'EVEN_PAGE_COUNT_REMINDER')).toBeDefined();
  });
});
