import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getBook, listChapters } from '@/lib/agentic-os/creator/books-repo';
import { getTarget } from '@/lib/agentic-os/creator/publishing-targets-repo';
import { tiptapJsonToMarkdown } from '@/lib/agentic-os/creator/tiptap-to-md';
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';
import {
  buildPreset,
  buildPandocMetadata,
  TRIM_GEOMETRIES,
  type OutputFormat,
} from '@/lib/agentic-os/creator/export-presets';
import { preflight, type ExportMode } from '@/lib/agentic-os/creator/preflight';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execAsync = promisify(exec);

const LEGACY_FORMATS = ['docx', 'pdf', 'epub'] as const;
type LegacyFormat = (typeof LEGACY_FORMATS)[number];

const CONTENT_TYPES: Record<OutputFormat | 'docx', string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
};

const EXTENSIONS: Record<OutputFormat | 'docx', string> = {
  docx: 'docx',
  pdf: 'pdf',
  epub: 'epub',
};

/**
 * Two-shape body:
 *  - Legacy:   { format: 'docx'|'pdf'|'epub' } — no preset, pandoc defaults.
 *  - Targeted: { targetId, mode: 'draft'|'publish_ready' } — runs through
 *              preset + preflight gate.
 */
const ExportBody = z.union([
  z.object({
    format: z.enum(LEGACY_FORMATS),
  }),
  z.object({
    targetId: z.string().uuid(),
    mode: z.enum(['draft', 'publish_ready'] as const),
  }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookId } = await params;

  const book = await getBook(bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const parsed = ExportBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const chapters = await listChapters(bookId, user.userId);

  // ─── Legacy path: format-only export ─────────────────────────────────────
  if ('format' in parsed.data) {
    return runLegacyExport({
      book,
      chapters,
      format: parsed.data.format,
      userId: user.userId,
      bookId,
    });
  }

  // ─── Targeted path: preset + preflight ───────────────────────────────────
  const target = await getTarget(parsed.data.targetId, bookId, user.userId);
  if (!target) {
    return NextResponse.json({ error: 'Target not found' }, { status: 404 });
  }

  const mode: ExportMode = parsed.data.mode;
  const pf = preflight({ book, chapters, target, mode });

  if (!pf.ok) {
    return NextResponse.json(
      {
        error: 'Pre-flight failed',
        warnings: pf.warnings,
        blockers: pf.blockers,
      },
      { status: 422 },
    );
  }

  let preset;
  try {
    preset = buildPreset({
      platform: target.platform,
      format: target.format,
      trim:
        target.trimSize != null && TRIM_GEOMETRIES[target.trimSize]
          ? TRIM_GEOMETRIES[target.trimSize]
          : undefined,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to build preset' },
      { status: 400 },
    );
  }

  return runPresetExport({
    book,
    chapters,
    preset,
    target,
    userId: user.userId,
    bookId,
    warnings: pf.warnings,
  });
}

// ─── Legacy export (no preset) ──────────────────────────────────────────────

async function runLegacyExport(args: {
  book: Awaited<ReturnType<typeof getBook>>;
  chapters: Awaited<ReturnType<typeof listChapters>>;
  format: LegacyFormat;
  userId: string;
  bookId: string;
}): Promise<Response> {
  const { book, chapters, format, userId, bookId } = args;
  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  const md = buildMarkdown(book.title, book.description, chapters);
  const tmpDir = tmpdir();
  const mdPath = join(tmpDir, `${randomUUID()}.md`);
  const outPath = join(tmpDir, `${randomUUID()}.${EXTENSIONS[format]}`);

  try {
    await writeFile(mdPath, md, 'utf-8');
    await execAsync(`pandoc "${mdPath}" -o "${outPath}"`);

    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(outPath);
    const safeTitle = sanitizeFilename(book.title);

    if (format === 'pdf') {
      return respondWithPdf({
        buffer,
        slug: 'creator',
        tenantId: userId,
        key: `books/${bookId}/${safeTitle}.pdf`,
        filename: `${safeTitle}.pdf`,
        disposition: 'attachment',
      });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPES[format],
        'Content-Disposition': `attachment; filename="${safeTitle}.${EXTENSIONS[format]}"`,
      },
    });
  } catch (err: unknown) {
    return pandocErrorResponse(err);
  } finally {
    await unlink(mdPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

// ─── Preset-driven export ──────────────────────────────────────────────────

async function runPresetExport(args: {
  book: NonNullable<Awaited<ReturnType<typeof getBook>>>;
  chapters: Awaited<ReturnType<typeof listChapters>>;
  preset: ReturnType<typeof buildPreset>;
  target: NonNullable<Awaited<ReturnType<typeof getTarget>>>;
  userId: string;
  bookId: string;
  warnings: Array<{ code: string; message: string }>;
}): Promise<Response> {
  const { book, chapters, preset, target, userId, bookId, warnings } = args;

  const md = buildMarkdown(book.title, book.description, chapters, book);
  const metadataYaml = buildPandocMetadata({
    title: book.title,
    subtitle: book.subtitle,
    authorDisplayName: book.authorDisplayName,
    isbn: target.isbn,
    language: book.language,
    bisacCodes: target.bisacCodes,
    copyrightYear: book.copyrightYear,
    coverImageUrl: book.coverImageUrl,
  });

  const tmpDir = tmpdir();
  const mdPath = join(tmpDir, `${randomUUID()}.md`);
  const metaPath = join(tmpDir, `${randomUUID()}-meta.yaml`);
  const outPath = join(tmpDir, `${randomUUID()}.${EXTENSIONS[preset.output]}`);

  try {
    await writeFile(mdPath, md, 'utf-8');
    await writeFile(metaPath, metadataYaml, 'utf-8');

    const argv = [
      `"${mdPath}"`,
      '--metadata-file',
      `"${metaPath}"`,
      ...preset.pandocArgs,
      '-o',
      `"${outPath}"`,
    ].join(' ');

    await execAsync(`pandoc ${argv}`);

    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(outPath);
    const safeTitle = sanitizeFilename(book.title);
    const platformSuffix = target.platform.replace(/_/g, '-');
    const filename = `${safeTitle}-${platformSuffix}.${EXTENSIONS[preset.output]}`;

    // Surface warnings via a non-blocking response header so the client
    // can show them without re-fetching. JSON-encoded so multi-line OK.
    const warningHeader =
      warnings.length > 0
        ? JSON.stringify(warnings.concat(preset.notes.map((m) => ({ code: 'PRESET_NOTE', message: m }))))
        : '';

    if (preset.output === 'pdf') {
      const response = await respondWithPdf({
        buffer,
        slug: 'creator',
        tenantId: userId,
        key: `books/${bookId}/${filename}`,
        filename,
        disposition: 'attachment',
      });
      if (warningHeader) response.headers.set('X-Creator-Export-Warnings', warningHeader);
      return response;
    }

    const response = new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPES[preset.output],
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
    if (warningHeader) response.headers.set('X-Creator-Export-Warnings', warningHeader);
    return response;
  } catch (err: unknown) {
    return pandocErrorResponse(err);
  } finally {
    await unlink(mdPath).catch(() => {});
    await unlink(metaPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildMarkdown(
  title: string,
  description: string | null,
  chapters: Awaited<ReturnType<typeof listChapters>>,
  book?: NonNullable<Awaited<ReturnType<typeof getBook>>>,
): string {
  let md = `# ${title}\n\n`;
  if (book?.subtitle) md += `## ${book.subtitle}\n\n`;
  if (description) md += `> ${description}\n\n`;
  if (book?.dedication) md += `\n\n---\n\n*${book.dedication}*\n\n---\n\n`;
  md += '\n';

  for (const chapter of chapters) {
    md += `# ${chapter.title}\n\n`;
    md += tiptapJsonToMarkdown(chapter.content);
    md += '\n\n';
  }

  if (book?.aboutAuthor) {
    md += `\n\n---\n\n## About the author\n\n${book.aboutAuthor}\n\n`;
  }

  return md;
}

function sanitizeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Book';
}

function pandocErrorResponse(err: unknown): NextResponse {
  if (
    err instanceof Error &&
    (err.message.includes('pandoc') ||
      (err as NodeJS.ErrnoException).code === 'ENOENT')
  ) {
    return NextResponse.json(
      { error: 'Pandoc is not installed. Install pandoc to enable exports.' },
      { status: 500 },
    );
  }
  return NextResponse.json(
    {
      error: 'Export failed',
      detail: err instanceof Error ? err.message : 'Unknown error',
    },
    { status: 500 },
  );
}
