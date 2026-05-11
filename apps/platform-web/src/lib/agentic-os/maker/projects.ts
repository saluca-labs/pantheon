/**
 * Maker OS — Project domain types and pure helpers.
 *
 * Defines the `MakerProject` entity, the 8-value status taxonomy, and the
 * 7-key phase-progress vector the Project Hub renders. No database calls
 * here — those live in repo.ts.
 *
 * Status vs phase
 * ---------------
 * `PROJECT_STATUSES` is the lifecycle column on the row. It has 8 values:
 * the 7 phases (concept → done) plus `archived` as a terminal state.
 *
 * `MAKER_PHASES` is the 7-entry vector stored as JSONB in `phase_progress`.
 * `archived` is not tracked there because progress on an archived project
 * is no longer meaningful.
 *
 * References:
 *   - Hardware-project lifecycle vocab adapted from common maker conventions
 *     (concept / design / procurement / fabrication / assembly / commissioning).
 *   - JSONB phase-progress pattern shared with Filmmaker Phase 1 (see
 *     `lib/agentic-os/filmmaker/projects.ts`).
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

// ─── Status taxonomy ─────────────────────────────────────────────────────────

/**
 * Ordered list of Maker-project lifecycle statuses.
 *
 * - `concept`       — idea capture, scoping, success criteria
 * - `design`        — CAD, schematics, calculations
 * - `procurement`   — sourcing parts, ordering, receiving
 * - `fabrication`   — making parts (printing, cutting, milling, etching)
 * - `assembly`      — putting parts together, wiring, integration
 * - `commissioning` — testing, calibration, first runs, debugging
 * - `done`          — project complete, lessons-learned captured
 * - `archived`      — retired / shelved (terminal, not a progress bucket)
 */
export const PROJECT_STATUSES = [
  'concept',
  'design',
  'procurement',
  'fabrication',
  'assembly',
  'commissioning',
  'done',
  'archived',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  concept: 'Concept',
  design: 'Design',
  procurement: 'Procurement',
  fabrication: 'Fabrication',
  assembly: 'Assembly',
  commissioning: 'Commissioning',
  done: 'Done',
  archived: 'Archived',
};

// ─── Phase progress ──────────────────────────────────────────────────────────

/**
 * The 7 phases tracked on `phase_progress`. Mirrors `PROJECT_STATUSES`
 * minus `archived` — an archived project's progress is no longer
 * meaningful so we don't store a slot for it.
 */
export const MAKER_PHASES = [
  'concept',
  'design',
  'procurement',
  'fabrication',
  'assembly',
  'commissioning',
  'done',
] as const;

export type MakerPhase = (typeof MAKER_PHASES)[number];

export const MAKER_PHASE_LABELS: Record<MakerPhase, string> = {
  concept: 'Concept',
  design: 'Design',
  procurement: 'Procurement',
  fabrication: 'Fabrication',
  assembly: 'Assembly',
  commissioning: 'Commissioning',
  done: 'Done',
};

/** Per-phase completion percentage. Stored as a single JSONB column. */
export type PhaseProgress = Record<MakerPhase, number>;

export function phaseProgressDefault(): PhaseProgress {
  return {
    concept: 0,
    design: 0,
    procurement: 0,
    fabrication: 0,
    assembly: 0,
    commissioning: 0,
    done: 0,
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
  for (const key of MAKER_PHASES) {
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
 *   - any object whose keys are a subset of `MAKER_PHASES`
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
  const known = new Set<string>(MAKER_PHASES);

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
    out[key as MakerPhase] = raw;
  }

  return { ok: true, value: out };
}

/**
 * Validate a status value against the 8-value enum. Returns a human-readable
 * error string or null when valid.
 */
export function validateProjectStatus(value: unknown): string | null {
  if (typeof value !== 'string' || !(PROJECT_STATUSES as readonly string[]).includes(value)) {
    return `Status must be one of: ${PROJECT_STATUSES.join(', ')}.`;
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Average of the 7 phase percentages, 0..100, integer.
 *
 * Empty / missing phases coerce to 0 first via `coercePhaseProgress` so the
 * helper is safe to call with the raw JSONB read from the DB.
 */
export function projectPhaseAvg(progress: unknown): number {
  const coerced = coercePhaseProgress(progress);
  let sum = 0;
  for (const key of MAKER_PHASES) sum += coerced[key];
  return Math.round(sum / MAKER_PHASES.length);
}

/** Return a URL-safe slug derived from the project name. */
export function projectSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
