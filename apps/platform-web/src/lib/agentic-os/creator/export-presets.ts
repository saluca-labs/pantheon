/**
 * Creator OS — Per-platform export presets.
 *
 * Each preset describes how to invoke pandoc (and the underlying
 * xelatex/ePub engines) for a specific publishing target. The export
 * route picks a preset based on `target.platform` + `target.trimSize`
 * and assembles the right CLI args + metadata.
 *
 * What's modeled
 * --------------
 * - Output format (pdf / epub3 / docx)
 * - Pandoc CLI args (engine, geometry, metadata flags)
 * - PDF interior geometry per trim (page width/height in inches,
 *   inside/outside/top/bottom margins) — KDP/Lulu/IngramSpark expect
 *   exact interior dimensions
 * - ePub3 metadata block (title, subtitle, author, ISBN as
 *   dc:identifier, language, BISAC subjects, copyright year, dedication
 *   passthrough to a frontmatter doc)
 *
 * What's NOT modeled (deferred to v2)
 * -----------------------------------
 * - PDF/X-1a post-processing. xelatex emits PDF/1.5 by default;
 *   IngramSpark wants PDF/X-1a:2001. Workaround for v1: the preset
 *   surfaces this as a pre-flight WARNING so the author runs the
 *   resulting PDF through Adobe Acrobat's Preflight or a
 *   GhostScript convert before uploading.
 * - Bleed for cover files. v1 only handles the *interior* of
 *   paperbacks; the cover is a separate workflow (KDP cover
 *   calculator, etc.).
 * - Font embedding choices. xelatex embeds by default; pandoc's
 *   default font for xelatex is Latin Modern which is reasonable
 *   for most body text.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import type {
  PublishingPlatform,
  PublishingFormat,
} from './publishing-targets';

export type OutputFormat = 'pdf' | 'epub' | 'docx';

export interface TrimGeometry {
  /** Trim size key, e.g. "6x9" */
  trimSize: string;
  /** Page width in inches */
  widthIn: number;
  /** Page height in inches */
  heightIn: number;
  /** Inside (gutter) margin in inches — KDP scales with page count;
   *  we use a conservative default that covers most book lengths. */
  insideIn: number;
  /** Outside margin in inches */
  outsideIn: number;
  /** Top margin in inches */
  topIn: number;
  /** Bottom margin in inches */
  bottomIn: number;
}

/** Common trim sizes supported across KDP / Lulu / IngramSpark. */
export const TRIM_GEOMETRIES: Record<string, TrimGeometry> = {
  '5x8': {
    trimSize: '5x8',
    widthIn: 5.0,
    heightIn: 8.0,
    insideIn: 0.75,
    outsideIn: 0.5,
    topIn: 0.5,
    bottomIn: 0.5,
  },
  '5.06x7.81': {
    trimSize: '5.06x7.81',
    widthIn: 5.062,
    heightIn: 7.812,
    insideIn: 0.75,
    outsideIn: 0.5,
    topIn: 0.5,
    bottomIn: 0.5,
  },
  '5.25x8': {
    trimSize: '5.25x8',
    widthIn: 5.25,
    heightIn: 8.0,
    insideIn: 0.75,
    outsideIn: 0.5,
    topIn: 0.5,
    bottomIn: 0.5,
  },
  '5.5x8.5': {
    trimSize: '5.5x8.5',
    widthIn: 5.5,
    heightIn: 8.5,
    insideIn: 0.75,
    outsideIn: 0.5,
    topIn: 0.5,
    bottomIn: 0.5,
  },
  '6x9': {
    trimSize: '6x9',
    widthIn: 6.0,
    heightIn: 9.0,
    insideIn: 0.75,
    outsideIn: 0.5,
    topIn: 0.625,
    bottomIn: 0.625,
  },
  '7x10': {
    trimSize: '7x10',
    widthIn: 7.0,
    heightIn: 10.0,
    insideIn: 0.875,
    outsideIn: 0.5,
    topIn: 0.75,
    bottomIn: 0.75,
  },
  '8x10': {
    trimSize: '8x10',
    widthIn: 8.0,
    heightIn: 10.0,
    insideIn: 0.875,
    outsideIn: 0.5,
    topIn: 0.75,
    bottomIn: 0.75,
  },
  '8.5x11': {
    trimSize: '8.5x11',
    widthIn: 8.5,
    heightIn: 11.0,
    insideIn: 1.0,
    outsideIn: 0.5,
    topIn: 0.75,
    bottomIn: 0.75,
  },
};

export interface ExportPreset {
  platform: PublishingPlatform;
  format: PublishingFormat;
  output: OutputFormat;
  /** Pandoc CLI args (excluding input/output file paths) */
  pandocArgs: string[];
  /** Human-readable preset name for UI + logs */
  label: string;
  /** Notes/warnings surfaced in pre-flight (e.g. PDF/X-1a caveat) */
  notes: readonly string[];
}

/**
 * Build a preset for a given (platform, format, trimGeometry?).
 * trimGeometry is required for paperback/hardcover; ignored for ebook.
 */
export function buildPreset(args: {
  platform: PublishingPlatform;
  format: PublishingFormat;
  trim?: TrimGeometry;
}): ExportPreset {
  const { platform, format, trim } = args;

  if (format === 'ebook') {
    return buildEpubPreset(platform);
  }

  if (!trim) {
    throw new Error(
      `Trim geometry required for ${format} output (platform=${platform})`,
    );
  }

  return buildPdfPreset(platform, format, trim);
}

function buildPdfPreset(
  platform: PublishingPlatform,
  format: PublishingFormat,
  trim: TrimGeometry,
): ExportPreset {
  // Inside / outside margins → twoside book layout. Pandoc passes
  // these through to LaTeX's `geometry` package.
  const pandocArgs = [
    '--pdf-engine=xelatex',
    '-V',
    `papersize={${trim.widthIn}in,${trim.heightIn}in}`,
    '-V',
    `geometry:paperwidth=${trim.widthIn}in`,
    '-V',
    `geometry:paperheight=${trim.heightIn}in`,
    '-V',
    `geometry:inner=${trim.insideIn}in`,
    '-V',
    `geometry:outer=${trim.outsideIn}in`,
    '-V',
    `geometry:top=${trim.topIn}in`,
    '-V',
    `geometry:bottom=${trim.bottomIn}in`,
    '-V',
    'classoption:twoside',
    '-V',
    'classoption:openright',
    '-V',
    'documentclass=book',
    '-V',
    'fontsize=11pt',
    '-V',
    'mainfont=Latin Modern Roman',
    '-V',
    'linestretch=1.2',
    '--toc',
    '--toc-depth=1',
  ];

  const notes: string[] = [];
  if (platform === 'ingramspark_paperback') {
    notes.push(
      'IngramSpark requires PDF/X-1a:2001. xelatex emits PDF/1.5 — run the output through Acrobat Preflight or `gs -dPDFX` before uploading.',
    );
  }

  return {
    platform,
    format,
    output: 'pdf',
    pandocArgs,
    label: `${formatPlatformLabel(platform)} · ${trim.trimSize}`,
    notes,
  };
}

function buildEpubPreset(platform: PublishingPlatform): ExportPreset {
  const pandocArgs = [
    '--to=epub3',
    '--toc',
    '--toc-depth=2',
    '--split-level=1',
    '--epub-chapter-level=1',
  ];

  const notes: string[] = [];
  if (platform === 'kdp_ebook') {
    notes.push(
      'KDP accepts ePub3 directly; the converter on their side regenerates the KPF. For best fidelity supply a 1600×2560 cover JPEG via coverImageUrl on the book.',
    );
  }

  return {
    platform,
    format: 'ebook',
    output: 'epub',
    pandocArgs,
    label: `${formatPlatformLabel(platform)} · ebook`,
    notes,
  };
}

function formatPlatformLabel(p: PublishingPlatform): string {
  return ({
    kdp_paperback: 'KDP Paperback',
    kdp_ebook: 'KDP Ebook',
    lulu_paperback: 'Lulu Paperback',
    ingramspark_paperback: 'IngramSpark Paperback',
    generic_epub: 'Generic ePub',
  } as const)[p];
}

/**
 * Build the YAML metadata block pandoc reads via `--metadata-file`.
 * Captures title, subtitle, author, ISBN, language, BISAC subjects,
 * copyright year. Returned as a string ready to write to a temp file.
 */
export function buildPandocMetadata(args: {
  title: string;
  subtitle: string | null;
  authorDisplayName: string | null;
  isbn: string | null;
  language: string;
  bisacCodes: string[];
  copyrightYear: number | null;
  coverImageUrl: string | null;
}): string {
  const lines: string[] = ['---'];
  lines.push(`title: ${yamlEscape(args.title)}`);
  if (args.subtitle) lines.push(`subtitle: ${yamlEscape(args.subtitle)}`);
  if (args.authorDisplayName) {
    lines.push(`author: ${yamlEscape(args.authorDisplayName)}`);
  }
  lines.push(`lang: ${args.language}`);
  if (args.isbn) {
    lines.push(`identifier:`);
    lines.push(`  - scheme: ISBN`);
    lines.push(`    text: ${args.isbn}`);
  }
  if (args.bisacCodes.length > 0) {
    lines.push(`subject:`);
    for (const code of args.bisacCodes) {
      lines.push(`  - ${code}`);
    }
  }
  if (args.copyrightYear) {
    lines.push(`rights: © ${args.copyrightYear} ${yamlEscape(
      args.authorDisplayName ?? 'All rights reserved',
    )}`);
  }
  if (args.coverImageUrl) {
    lines.push(`cover-image: ${args.coverImageUrl}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function yamlEscape(s: string): string {
  // Quote if it contains any YAML-special character; escape inner quotes.
  if (/[:#&*!|>'"%@`\n]/.test(s) || s.startsWith('-') || s.startsWith('?')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}
