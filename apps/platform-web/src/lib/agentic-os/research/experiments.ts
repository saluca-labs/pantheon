/**
 * Research OS — Experiment domain types and pure helpers.
 *
 * Defines the `ResearchExperiment` entity, the 6-value status taxonomy,
 * and the 5-key phase-progress vector the Experiment Hub renders. No
 * database calls here — those live in repo.ts.
 *
 * Status vs phase
 * ---------------
 * `EXPERIMENT_STATUSES` is the lifecycle column on the row. It has 6
 * values: the 5 progress-bearing phases (planning → published) plus
 * `archived` as a terminal state.
 *
 * `EXPERIMENT_PHASES` is the 5-entry vector stored as JSONB in
 * `phase_progress`. `archived` is not tracked there because progress on
 * an archived experiment is no longer meaningful.
 *
 * References:
 *   - Status taxonomy follows the bench → analysis → writeup → publish
 *     research lifecycle common to PhD-scale lab work; vocabulary is
 *     domain-neutral so it applies across CS / wet-bench / theory work.
 *   - JSONB phase-progress pattern shared with Maker Phase 1 (see
 *     `lib/agentic-os/maker/projects.ts`).
 *
 * @license MIT — Tiresias Research OS (internal).
 */

// ─── Status taxonomy ─────────────────────────────────────────────────────────

/**
 * Ordered list of Research-experiment lifecycle statuses.
 *
 * - `planning`  — protocol design, hypothesis setup, dataset / sample acquisition
 * - `running`   — data collection / experiment execution under way
 * - `analysis`  — data analysis, modeling, statistical work
 * - `writeup`   — preparing the manuscript / report / thesis chapter
 * - `published` — published, defended, or otherwise externally released
 * - `archived`  — shelved / retired (terminal, not a progress bucket)
 */
export const EXPERIMENT_STATUSES = [
  'planning',
  'running',
  'analysis',
  'writeup',
  'published',
  'archived',
] as const;

export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  planning: 'Planning',
  running: 'Running',
  analysis: 'Analysis',
  writeup: 'Write-up',
  published: 'Published',
  archived: 'Archived',
};

// ─── Phase progress ──────────────────────────────────────────────────────────

/**
 * The 5 phases tracked on `phase_progress`. Mirrors `EXPERIMENT_STATUSES`
 * minus `archived` — an archived experiment's progress is no longer
 * meaningful so we don't store a slot for it.
 */
export const EXPERIMENT_PHASES = [
  'planning',
  'running',
  'analysis',
  'writeup',
  'published',
] as const;

export type ExperimentPhase = (typeof EXPERIMENT_PHASES)[number];

export const EXPERIMENT_PHASE_LABELS: Record<ExperimentPhase, string> = {
  planning: 'Planning',
  running: 'Running',
  analysis: 'Analysis',
  writeup: 'Write-up',
  published: 'Published',
};

/** Per-phase completion percentage. Stored as a single JSONB column. */
export type PhaseProgress = Record<ExperimentPhase, number>;

export function phaseProgressDefault(): PhaseProgress {
  return {
    planning: 0,
    running: 0,
    analysis: 0,
    writeup: 0,
    published: 0,
  };
}

/**
 * Normalize an arbitrary JSON value into a complete `PhaseProgress`.
 * Missing keys default to 0, non-numeric entries are dropped, and every
 * value is clamped to the 0-100 range and rounded to an integer.
 */
export function coercePhaseProgress(value: unknown): PhaseProgress {
  const out = phaseProgressDefault();
  if (!value || typeof value !== 'object') return out;
  const v = value as Record<string, unknown>;
  for (const key of EXPERIMENT_PHASES) {
    const raw = v[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      out[key] = Math.max(0, Math.min(100, Math.round(raw)));
    }
  }
  return out;
}

// ─── Validators ──────────────────────────────────────────────────────────────

/**
 * Validate a `phase_progress` JSON body for the PATCH route.
 *
 * Accepts:
 *   - any object whose keys are a subset of `EXPERIMENT_PHASES`
 *   - missing keys (filled with 0)
 *   - integer values in 0..100
 *
 * Rejects:
 *   - non-object inputs (null, string, array, number)
 *   - unknown phase keys
 *   - non-integer or out-of-range numeric values
 *   - non-numeric values
 *
 * Returns a discriminated result so callers don't have to throw.
 */
export function validatePhaseProgress(
  input: unknown,
):
  | { ok: true; value: PhaseProgress }
  | { ok: false; error: string } {
  if (input === null || input === undefined) {
    return { ok: false, error: 'phase_progress body required' };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'phase_progress must be an object' };
  }

  const obj = input as Record<string, unknown>;
  const out = phaseProgressDefault();
  const known = new Set<string>(EXPERIMENT_PHASES);

  for (const [key, raw] of Object.entries(obj)) {
    if (!known.has(key)) {
      return { ok: false, error: `Unknown phase key: ${key}` };
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { ok: false, error: `phase ${key} must be a finite number` };
    }
    if (!Number.isInteger(raw)) {
      return { ok: false, error: `phase ${key} must be an integer (got ${raw})` };
    }
    if (raw < 0 || raw > 100) {
      return { ok: false, error: `phase ${key} must be in 0..100 (got ${raw})` };
    }
    out[key as ExperimentPhase] = raw;
  }

  return { ok: true, value: out };
}

/**
 * Validate a status value against the 6-value enum. Returns a human-readable
 * error string or null when valid.
 */
export function validateExperimentStatus(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(EXPERIMENT_STATUSES as readonly string[]).includes(value)
  ) {
    return `Status must be one of: ${EXPERIMENT_STATUSES.join(', ')}.`;
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Average of the 5 phase percentages, 0..100, integer.
 *
 * Empty / missing phases coerce to 0 first via `coercePhaseProgress` so the
 * helper is safe to call with the raw JSONB read from the DB.
 */
export function experimentPhaseAvg(progress: unknown): number {
  const coerced = coercePhaseProgress(progress);
  let sum = 0;
  for (const key of EXPERIMENT_PHASES) sum += coerced[key];
  return Math.round(sum / EXPERIMENT_PHASES.length);
}

/** Return a URL-safe slug derived from the experiment name. */
export function experimentSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Phase 5 — export eligibility ────────────────────────────────────────────

/**
 * Pure predicate: does the supplied content count vector indicate the
 * experiment has ANY content worth exporting? Used by the PDF route to
 * refuse export on a truly-empty experiment.
 *
 * An experiment is empty when EVERY one of its content surfaces
 * (notebook entries, hypotheses, papers, datasets, protocols) is zero.
 */
export interface ExperimentContentCounts {
  notebookEntries: number;
  hypotheses: number;
  papers: number;
  datasets: number;
  protocols: number;
}

export function hasAnyExportContent(counts: ExperimentContentCounts): boolean {
  return (
    counts.notebookEntries > 0 ||
    counts.hypotheses > 0 ||
    counts.papers > 0 ||
    counts.datasets > 0 ||
    counts.protocols > 0
  );
}

// ─── Hub-side filter helpers (pure; exported for tests) ──────────────────────

export type StatusFilter = ExperimentStatus | 'all';
export type SortKey = 'name' | 'created' | 'target';

export interface ResearchExperimentForFilter {
  name: string;
  status: ExperimentStatus;
  tags: string[];
  archivedAt: string | null;
  targetCompletionDate: string | null;
  createdAt: string;
}

export interface ExperimentFilterOpts {
  status: StatusFilter;
  tag?: string | null;
  archived?: boolean;
  sort: SortKey;
}

export function applyExperimentFilters<T extends ResearchExperimentForFilter>(
  experiments: T[],
  opts: ExperimentFilterOpts,
): T[] {
  let filtered = experiments;

  if (opts.archived === true) {
    filtered = filtered.filter((e) => e.archivedAt != null);
  } else if (opts.archived === false || opts.archived === undefined) {
    filtered = filtered.filter((e) => e.archivedAt == null);
  }

  if (opts.status !== 'all') {
    filtered = filtered.filter((e) => e.status === opts.status);
  }

  if (opts.tag && opts.tag.trim()) {
    const t = opts.tag.trim().toLowerCase();
    filtered = filtered.filter((e) => e.tags.some((x) => x.toLowerCase() === t));
  }

  const sorted = [...filtered];
  if (opts.sort === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (opts.sort === 'target') {
    sorted.sort((a, b) => {
      const at = a.targetCompletionDate ?? '9999-99-99';
      const bt = b.targetCompletionDate ?? '9999-99-99';
      return at.localeCompare(bt);
    });
  } else {
    sorted.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  }
  return sorted;
}
