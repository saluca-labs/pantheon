/**
 * Filmmaker OS — Story Document domain types + helpers.
 *
 * Story documents are per-project rich-text artefacts with a `kind`
 * discriminator (bible / treatment / logline / outline / pitch_deck).
 * The body is TipTap JSON (ProseMirror schema); the server denormalises
 * plain text + word count for search and display.
 *
 * No database calls here — those live in repo.ts.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

// ─── Kind taxonomy ───────────────────────────────────────────────────────────

export const STORY_DOCUMENT_KIND_VALUES = [
  'bible',
  'treatment',
  'logline',
  'outline',
  'pitch_deck',
] as const;

export type StoryDocumentKind = (typeof STORY_DOCUMENT_KIND_VALUES)[number];

export interface StoryDocumentKindInfo {
  kind: StoryDocumentKind;
  label: string;
  description: string;
  defaultTitle: (projectName: string) => string;
}

export const STORY_DOCUMENT_KINDS: StoryDocumentKindInfo[] = [
  {
    kind: 'bible',
    label: 'Series Bible',
    description: 'World rules, themes, tone, recurring motifs.',
    defaultTitle: (p) => `${p} — Bible`,
  },
  {
    kind: 'treatment',
    label: 'Treatment',
    description: 'Full narrative treatment in prose.',
    defaultTitle: (p) => `${p} — Treatment`,
  },
  {
    kind: 'logline',
    label: 'Logline',
    description: 'One-sentence pitch.',
    defaultTitle: (p) => `${p} — Logline`,
  },
  {
    kind: 'outline',
    label: 'Outline',
    description: 'Structural outline, acts and beats.',
    defaultTitle: (p) => `${p} — Outline`,
  },
  {
    kind: 'pitch_deck',
    label: 'Pitch Deck',
    description: 'Pitch deck content sections.',
    defaultTitle: (p) => `${p} — Pitch Deck`,
  },
];

export const STORY_DOCUMENT_KIND_LABEL: Record<StoryDocumentKind, string> =
  Object.fromEntries(STORY_DOCUMENT_KINDS.map((k) => [k.kind, k.label])) as Record<
    StoryDocumentKind,
    string
  >;

export function getStoryDocumentKindInfo(
  kind: StoryDocumentKind,
): StoryDocumentKindInfo {
  const info = STORY_DOCUMENT_KINDS.find((k) => k.kind === kind);
  if (!info) throw new Error(`Unknown story document kind: ${kind}`);
  return info;
}

// ─── Entities ────────────────────────────────────────────────────────────────

/**
 * ProseMirror JSON document. TipTap emits this shape; we treat it as
 * opaque JSON on the server (only `extractPlainText` walks it).
 */
export interface ProseMirrorJson {
  type?: string;
  text?: string;
  content?: ProseMirrorJson[];
  // attrs, marks, etc. are passthrough — we never inspect them here.
  [key: string]: unknown;
}

export interface StoryDocument {
  id: string;
  projectId: string;
  kind: StoryDocumentKind;
  title: string;
  contentJson: ProseMirrorJson;
  contentText: string;
  version: number;
  wordCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StoryDocumentVersion {
  id: string;
  documentId: string;
  version: number;
  contentJson: ProseMirrorJson;
  contentText: string;
  wordCount: number;
  createdAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Walk a TipTap JSON doc and return concatenated text content. Nodes are
 * joined with a single space (TipTap intersperses block/break nodes that
 * carry no text but logically separate words). Empty / non-object inputs
 * return `''`.
 */
export function extractPlainText(contentJson: unknown): string {
  if (!contentJson || typeof contentJson !== 'object') return '';
  const parts: string[] = [];
  const walk = (node: ProseMirrorJson): void => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.text === 'string') parts.push(node.text);
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child as ProseMirrorJson);
    }
  };
  walk(contentJson as ProseMirrorJson);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Count whitespace-separated word tokens in a string. Empty / whitespace
 * inputs return 0.
 */
export function countWords(text: string): number {
  if (typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).filter((t) => t.length > 0).length;
}

/**
 * Validate a kind string. Returns null when valid, error message otherwise.
 */
export function validateStoryDocumentKind(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(STORY_DOCUMENT_KIND_VALUES as readonly string[]).includes(value)
  ) {
    return `Kind must be one of: ${STORY_DOCUMENT_KIND_VALUES.join(', ')}.`;
  }
  return null;
}
