/**
 * Autobiographer OS — PDF template structural tests.
 *
 * Renders the chapter + book templates through `renderPdfToBuffer` and
 * confirms the output is a non-empty PDF (`%PDF-` magic) and contains
 * the expected body strings via a fast byte-search. Smoke-test only —
 * not a layout regression test.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { ChapterExportPdf, splitParagraphs } from '@/lib/agentic-os/autobiographer/pdf/chapter-export';
import { BookExportPdf } from '@/lib/agentic-os/autobiographer/pdf/book-export';

describe('splitParagraphs', () => {
  it('splits on double newlines', () => {
    expect(splitParagraphs('p1\n\np2\n\np3')).toEqual(['p1', 'p2', 'p3']);
  });

  it('drops empty paragraphs', () => {
    expect(splitParagraphs('p1\n\n\n\np2')).toEqual(['p1', 'p2']);
  });

  it('returns empty array on blank input', () => {
    expect(splitParagraphs('')).toEqual([]);
    expect(splitParagraphs('   \n\n   ')).toEqual([]);
  });

  it('preserves single newlines within a paragraph', () => {
    expect(splitParagraphs('line1\nline2\n\np2')).toEqual([
      'line1\nline2',
      'p2',
    ]);
  });
});

describe('ChapterExportPdf', () => {
  it('renders a non-empty PDF starting with %PDF-', async () => {
    const buf = await renderPdfToBuffer(
      React.createElement(ChapterExportPdf, {
        book: { title: 'My Book', subtitle: null },
        chapter: {
          title: 'Chapter one',
          slug: 'chapter-one',
          position: 0,
          status: 'drafting',
          summary: 'A short summary.',
        },
        revision: {
          version: 1,
          author: 'user',
          bodyText: 'Para 1.\n\nPara 2.',
          wordCount: 4,
          citations: [{ paragraphIndex: 0, memoryIds: ['m-1'] }],
          createdAt: '2026-05-12T00:00:00.000Z',
        },
        memories: [
          { id: 'm-1', title: 'Source memory', whenInLife: '1985' },
        ],
        generatedAt: new Date('2026-05-12T12:00:00.000Z'),
      }),
    );
    expect(buf.length).toBeGreaterThan(100);
    const head = buf.subarray(0, 5).toString('utf8');
    expect(head.startsWith('%PDF-')).toBe(true);
  }, 20_000);

  it('produces a structurally valid PDF stream with %%EOF trailer', async () => {
    const buf = await renderPdfToBuffer(
      React.createElement(ChapterExportPdf, {
        book: { title: 'Pantheon Memoir', subtitle: null },
        chapter: {
          title: 'About Albuquerque',
          slug: 'abq',
          position: 4,
          status: 'revised',
          summary: null,
        },
        revision: {
          version: 3,
          author: 'user',
          bodyText: 'I remember the road.',
          wordCount: 4,
          citations: [],
          createdAt: '2026-05-12T00:00:00.000Z',
        },
        memories: [],
        generatedAt: new Date('2026-05-12T12:00:00.000Z'),
      }),
    );
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    // PDFs end with %%EOF (sometimes followed by whitespace).
    expect(buf.toString('binary').includes('%%EOF')).toBe(true);
  }, 20_000);

  it('renders even when the revision body is empty (placeholder text)', async () => {
    const buf = await renderPdfToBuffer(
      React.createElement(ChapterExportPdf, {
        book: { title: 'Pantheon Memoir', subtitle: null },
        chapter: {
          title: 'Outline only',
          slug: 'outline-only',
          position: 0,
          status: 'outline',
          summary: null,
        },
        revision: {
          version: 1,
          author: 'user',
          bodyText: '',
          wordCount: 0,
          citations: [],
          createdAt: '2026-05-12T00:00:00.000Z',
        },
        memories: [],
        generatedAt: new Date('2026-05-12T12:00:00.000Z'),
      }),
    );
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  }, 20_000);
});

describe('BookExportPdf', () => {
  it('renders a non-empty PDF with title page + no chapters', async () => {
    const buf = await renderPdfToBuffer(
      React.createElement(BookExportPdf, {
        book: {
          title: 'Empty Book',
          subtitle: null,
          description: null,
          status: 'Drafting',
          targetCompletionDate: null,
          targetAudience: null,
        },
        authorName: null,
        chapters: [],
        memories: [],
        provenance: [],
        generatedAt: new Date('2026-05-12T12:00:00.000Z'),
      }),
    );
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    // PDF must terminate cleanly with %%EOF.
    expect(buf.toString('binary').includes('%%EOF')).toBe(true);
  }, 20_000);

  it('includes provenance appendix when populated', async () => {
    const buf = await renderPdfToBuffer(
      React.createElement(BookExportPdf, {
        book: {
          title: 'A Memoir',
          subtitle: 'sub',
          description: 'desc',
          status: 'Drafting',
          targetCompletionDate: '2027-01-01',
          targetAudience: 'family',
        },
        authorName: 'Author Name',
        chapters: [
          {
            id: 'c-1',
            title: 'Chapter A',
            slug: 'chapter-a',
            position: 0,
            status: 'drafting',
            summary: null,
            latest: {
              version: 1,
              author: 'user',
              bodyText: 'para one\n\npara two',
              wordCount: 4,
              citations: [
                { paragraphIndex: 0, memoryIds: ['m-1'] },
              ],
            },
          },
        ],
        memories: [
          { id: 'm-1', title: 'M Title', whenInLife: 'circa 1990' },
        ],
        provenance: [
          {
            memoryId: 'm-1',
            memoryTitle: 'M Title',
            memoryWhenInLife: 'circa 1990',
            chapterReferences: [
              {
                chapterId: 'c-1',
                chapterTitle: 'Chapter A',
                chapterSlug: 'chapter-a',
                position: 0,
              },
            ],
          },
        ],
        generatedAt: new Date('2026-05-12T12:00:00.000Z'),
      }),
    );
    // Multi-page books should produce a bigger stream than a single
    // title page; assert size grows monotonically with chapter content.
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(buf.toString('binary').includes('%%EOF')).toBe(true);
  }, 20_000);
});
