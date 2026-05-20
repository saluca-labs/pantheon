/**
 * Creator OS — Publish-readiness pre-flight validator.
 *
 * Given a book + chapters + publishing target, returns a structured
 * result indicating whether the export should proceed in
 * publish-ready mode. Draft exports skip pre-flight entirely.
 *
 * Two severities:
 *   - blocker: fails the export. Examples: missing ISBN at publish-
 *     ready, missing trim size on paperback, zero chapters.
 *   - warning: surface to the user but allow override. Examples:
 *     IngramSpark PDF/X-1a caveat, missing cover image for ebook,
 *     no BISAC codes (publishers will pick a default).
 *
 * Use shape:
 *   const r = preflight({ book, chapters, target, mode: 'publish_ready' });
 *   if (r.blockers.length > 0) return 422 + r;
 *   // else proceed
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import type { CreatorBook, CreatorChapter } from './books';
import type { PublishingTarget } from './publishing-targets';
import { isValidIsbn13 } from './publishing-targets';
import { TRIM_GEOMETRIES } from './export-presets';

export type ExportMode = 'draft' | 'publish_ready';

export interface PreflightIssue {
  /** Stable code for log/UI mapping, e.g. 'ISBN_MISSING' */
  code: string;
  /** Human-readable message */
  message: string;
  /** Field on the target or book this issue ties to (for UI scrolling) */
  field?: string;
}

export interface PreflightResult {
  ok: boolean;
  warnings: PreflightIssue[];
  blockers: PreflightIssue[];
}

export interface PreflightArgs {
  book: CreatorBook;
  chapters: CreatorChapter[];
  target: PublishingTarget;
  mode: ExportMode;
}

export function preflight(args: PreflightArgs): PreflightResult {
  const { book, chapters, target, mode } = args;
  const warnings: PreflightIssue[] = [];
  const blockers: PreflightIssue[] = [];

  // ─── Universal: must have at least one chapter ────────────────────────────
  if (chapters.length === 0) {
    blockers.push({
      code: 'NO_CHAPTERS',
      message: 'Book has no chapters. Add at least one chapter before export.',
    });
  } else if (chapters.every((c) => c.wordCount === 0)) {
    blockers.push({
      code: 'EMPTY_CHAPTERS',
      message: 'All chapters are empty. Write content before exporting.',
    });
  }

  // ─── Author display name ──────────────────────────────────────────────────
  if (mode === 'publish_ready' && !book.authorDisplayName?.trim()) {
    blockers.push({
      code: 'AUTHOR_NAME_MISSING',
      message:
        'Author display name is required for publish-ready export. Set it in Book details.',
      field: 'authorDisplayName',
    });
  }

  // ─── Per-format checks ────────────────────────────────────────────────────
  if (target.format === 'paperback' || target.format === 'hardcover') {
    if (!target.trimSize) {
      blockers.push({
        code: 'TRIM_MISSING',
        message: `Trim size is required for ${target.format} export.`,
        field: 'trimSize',
      });
    } else if (!TRIM_GEOMETRIES[target.trimSize]) {
      warnings.push({
        code: 'TRIM_UNKNOWN',
        message: `Trim size "${target.trimSize}" is not in the preset list. Using closest match may yield off-spec margins — verify before upload.`,
        field: 'trimSize',
      });
    }

    if (mode === 'publish_ready' && chapters.length > 0) {
      // KDP and most POD platforms require an even page count on
      // paperback. We can't compute pages without rendering, but we
      // can warn at >300 pages if inside margin might be insufficient,
      // and we always warn that the author should verify.
      warnings.push({
        code: 'EVEN_PAGE_COUNT_REMINDER',
        message:
          'Verify the rendered PDF has an even page count before upload — KDP/Lulu require even total pages for paperback.',
      });

      const totalWords = chapters.reduce((s, c) => s + c.wordCount, 0);
      const estimatedPages = Math.ceil(totalWords / 250); // ~250 wpp typical
      if (estimatedPages > 300) {
        warnings.push({
          code: 'LARGE_BOOK_GUTTER',
          message: `Estimated ${estimatedPages} pages. Books over 300 pages typically need a larger inside (gutter) margin — verify the bound copy.`,
        });
      }
    }
  }

  if (target.format === 'ebook' && mode === 'publish_ready') {
    if (!book.coverImageUrl) {
      blockers.push({
        code: 'COVER_MISSING',
        message:
          'Cover image is required for ebook export. Add a coverImageUrl on the book.',
        field: 'coverImageUrl',
      });
    }
  }

  // ─── ISBN ─────────────────────────────────────────────────────────────────
  if (mode === 'publish_ready') {
    if (!target.isbn?.trim()) {
      blockers.push({
        code: 'ISBN_MISSING',
        message:
          'ISBN-13 is required for publish-ready export. Assign one before generating the final file.',
        field: 'isbn',
      });
    } else if (!isValidIsbn13(target.isbn)) {
      blockers.push({
        code: 'ISBN_INVALID',
        message:
          'ISBN-13 fails checksum validation. Re-check the digits (must be 978/979 prefix + 13 digits with valid check digit).',
        field: 'isbn',
      });
    }
  }

  // ─── BISAC codes ──────────────────────────────────────────────────────────
  if (target.bisacCodes.length === 0) {
    warnings.push({
      code: 'BISAC_MISSING',
      message:
        'No BISAC subject codes. Publishers will assign defaults — explicitly setting 2–3 codes improves discoverability.',
      field: 'bisacCodes',
    });
  }

  // ─── Copyright year ───────────────────────────────────────────────────────
  if (mode === 'publish_ready' && !book.copyrightYear) {
    warnings.push({
      code: 'COPYRIGHT_YEAR_MISSING',
      message:
        'Copyright year not set. The export will omit the © line on the copyright page.',
      field: 'copyrightYear',
    });
  }

  // ─── Platform-specific ────────────────────────────────────────────────────
  if (target.platform === 'ingramspark_paperback' && mode === 'publish_ready') {
    warnings.push({
      code: 'INGRAMSPARK_PDFX',
      message:
        'IngramSpark requires PDF/X-1a:2001. xelatex emits PDF/1.5 — convert via Acrobat Preflight or `gs -dPDFX` before uploading.',
    });
  }

  // ─── Price ────────────────────────────────────────────────────────────────
  if (mode === 'publish_ready' && target.priceUsd == null) {
    warnings.push({
      code: 'PRICE_MISSING',
      message:
        'List price not set. The export file itself is unaffected — set it in the publisher dashboard at upload time.',
      field: 'priceUsd',
    });
  }

  return {
    ok: blockers.length === 0,
    warnings,
    blockers,
  };
}
