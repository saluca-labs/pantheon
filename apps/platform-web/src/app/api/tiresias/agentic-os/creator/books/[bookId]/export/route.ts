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
import { tiptapJsonToMarkdown } from '@/lib/agentic-os/creator/tiptap-to-md';
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execAsync = promisify(exec);

const FORMATS = ['docx', 'pdf', 'epub'] as const;
type ExportFormat = (typeof FORMATS)[number];

const CONTENT_TYPES: Record<ExportFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
};

const EXTENSIONS: Record<ExportFormat, string> = {
  docx: 'docx',
  pdf: 'pdf',
  epub: 'epub',
};

const ExportBody = z.object({
  format: z.enum(FORMATS),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookId } = await params;

  // Fetch book + chapters
  const book = await getBook(bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const parsed = ExportBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid format', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const format = parsed.data.format as ExportFormat;
  const chapters = await listChapters(bookId, user.userId);

  // Build markdown document
  let md = `# ${book.title}\n\n`;
  if (book.description) {
    md += `> ${book.description}\n\n`;
  }
  md += '\n';

  for (const chapter of chapters) {
    md += `# ${chapter.title}\n\n`;
    const chapterMd = tiptapJsonToMarkdown(chapter.content);
    md += chapterMd;
    md += '\n\n';
  }

  // Write to temp file
  const tmpDir = tmpdir();
  const mdPath = join(tmpDir, `${randomUUID()}.md`);
  const outPath = join(tmpDir, `${randomUUID()}.${EXTENSIONS[format]}`);

  try {
    await writeFile(mdPath, md, 'utf-8');

    await execAsync(`pandoc "${mdPath}" -o "${outPath}"`);

    // Read the output file
    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(outPath);

    const safeTitle = book.title.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Book';

    // PDF arm goes through respondWithPdf so the blob-store offload kicks
    // in once BLOB_STORE_DRIVER is set. docx / epub still ship inline.
    if (format === 'pdf') {
      return respondWithPdf({
        buffer,
        slug: 'creator',
        tenantId: user.userId,
        key: `books/${bookId}/${safeTitle}.pdf`,
        filename: `${safeTitle}.pdf`,
        disposition: 'attachment',
      });
    }

    const response = new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPES[format],
        'Content-Disposition': `attachment; filename="${safeTitle}.${EXTENSIONS[format]}"`,
      },
    });

    return response;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message.includes('pandoc') || (err as NodeJS.ErrnoException).code === 'ENOENT')
    ) {
      return NextResponse.json(
        { error: 'Pandoc is not installed. Install pandoc to enable exports.' },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: 'Export failed', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  } finally {
    // Clean up temp files
    await unlink(mdPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}
