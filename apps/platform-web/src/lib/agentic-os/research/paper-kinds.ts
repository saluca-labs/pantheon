/**
 * Research OS Phase 4 — paper kind enum + display helpers.
 *
 * Paper "kind" is one of nine values matching the migration's CHECK
 * constraint on `agos_research_papers.kind`. Helpers provide display
 * labels and a short description that the kind pill and filter chips
 * reuse.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

export const PAPER_KINDS = [
  'paper',
  'preprint',
  'thesis',
  'book',
  'chapter',
  'dataset_paper',
  'report',
  'blog',
  'other',
] as const;

export type PaperKind = (typeof PAPER_KINDS)[number];

export const PAPER_KIND_LABELS: Record<PaperKind, string> = {
  paper: 'Paper',
  preprint: 'Preprint',
  thesis: 'Thesis',
  book: 'Book',
  chapter: 'Chapter',
  dataset_paper: 'Dataset paper',
  report: 'Report',
  blog: 'Blog',
  other: 'Other',
};

export const PAPER_KIND_DESCRIPTIONS: Record<PaperKind, string> = {
  paper: 'Peer-reviewed journal or conference paper.',
  preprint: 'arXiv / bioRxiv / SSRN style preprint, not yet peer-reviewed.',
  thesis: 'PhD or master thesis.',
  book: 'Full-length book or monograph.',
  chapter: 'Book chapter.',
  dataset_paper: 'Data-descriptor paper attached to a dataset release.',
  report: 'Technical report / white paper.',
  blog: 'Blog post or short essay.',
  other: 'Any other literature kind.',
};

/** Type guard — returns the typed value or null. */
export function asPaperKind(value: unknown): PaperKind | null {
  if (typeof value !== 'string') return null;
  return (PAPER_KINDS as readonly string[]).includes(value) ? (value as PaperKind) : null;
}
