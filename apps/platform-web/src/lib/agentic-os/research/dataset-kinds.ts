/**
 * Research OS Phase 5 — dataset kind enum + display helpers.
 *
 * Six-value taxonomy matching the migration's CHECK constraint on
 * `agos_research_datasets.kind`. Helpers provide display labels and a
 * short description that the kind pill and filter chips reuse.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

export const DATASET_KINDS = [
  'tabular',
  'image',
  'timeseries',
  'sequence',
  'sim',
  'other',
] as const;

export type DatasetKind = (typeof DATASET_KINDS)[number];

export const DATASET_KIND_LABELS: Record<DatasetKind, string> = {
  tabular: 'Tabular',
  image: 'Image',
  timeseries: 'Timeseries',
  sequence: 'Sequence',
  sim: 'Simulation',
  other: 'Other',
};

export const DATASET_KIND_DESCRIPTIONS: Record<DatasetKind, string> = {
  tabular: 'Row/column data — CSV, parquet, TSV, etc.',
  image: 'Image collection — photos, microscopy, scans.',
  timeseries: 'Sampled-over-time data — sensor logs, EEG, finance.',
  sequence: 'Sequence data — DNA, RNA, protein, log sequences.',
  sim: 'Simulation outputs / synthetic data.',
  other: 'Any other dataset kind.',
};

/** Type guard — returns the typed value or null. */
export function asDatasetKind(value: unknown): DatasetKind | null {
  if (typeof value !== 'string') return null;
  return (DATASET_KINDS as readonly string[]).includes(value)
    ? (value as DatasetKind)
    : null;
}
