# ADR-010: Health OS Phase 3 — CBT Exercises Catalog + Meditation

> Status: accepted (May 2026, platform/agentic-os, Workstream Health)

## Context

Phase 1 (ADR-008) established the Health OS foundation: mental-health
profile, consent ledger, risk-flag substrate, and a shared
crisis-language guard. Phase 2 (ADR-009) added the daily tracking
primitives (mood, journal, PSS-10) and extracted the first
cross-OS scaffolding into `_shared/`.

Phase 3 ships the heaviest UI section of the Health OS buildout: the
seven CBT mini-wizards (thought record, behavioral activation,
worry-time, 5-4-3-2-1 grounding, three-good-things gratitude,
values-clarification, sleep-hygiene checklist) plus the meditation
tracker (sessions + a generated weekly plan).

Phase 3 also continues the Phase 2 contract: extract genuinely reusable
bits to `_shared/` so the remaining eight OSes can adopt them
without re-deriving the shape, and keep the safety contract
(every free-text write goes through `withCrisisGuard`) intact.

The questions Phase 3 needed to answer:

- How do we store the seven different CBT data shapes without
  exploding either the schema or the read paths?
- Where do CBT exercise definitions live — DB rows or hard-coded?
- How does the meditation plan get generated without an LLM?
- Do we ship a Medito API proxy, a static catalog, or both?
- Which Phase 3 patterns are reusable enough to pull into `_shared/`?

## Decision

### Schema decision: single CBT log table + JSONB per-kind data

`packages/database/alembic/versions/0016_health_os_phase3.py` is
strictly additive on top of Phase 2 (revision `0015_health_os_phase2`).
No earlier-phase column is renamed or dropped.

The seven CBT kinds each collect a different structured payload:

- `thought-record`        — situation, automatic_thought, evidence_for /
                            _against, balanced_thought, mood_before,
                            mood_after.
- `behavioral-activation` — activity, scheduled_for, completed,
                            mood_before, mood_after, reflection.
- `worry-time`            — scheduled_at, duration_min, worries[],
                            reflection.
- `grounding-54321`       — five_see[5], four_feel[4], three_hear[3],
                            two_smell[2], one_taste[1].
- `gratitude`             — entries[3].
- `values-clarification`  — values[]: { domain, importance, current_alignment, action }.
- `sleep-hygiene`         — checklist[]: { item, met }, notes.

We considered three storage shapes:

1. **Seven dedicated tables.** Most type-safe at the DDL layer, but
   listing/filtering/recent-logs become a UNION across seven tables;
   each read path branches; ~30+ columns total across the schema.
2. **One table, structured per-kind columns.** Sparse — 70%+ of any
   row's columns NULL; the CHECK constraint is untenable; adding an
   eighth kind means a wide migration.
3. **One table, `kind` discriminator + `data JSONB` payload.** Chosen.
   Validation moves to per-kind Zod schemas at the BFF layer
   (`schemas.ts`). The DDL stays trivial; the listing UI is one SELECT;
   adding an eighth kind is a one-line update to `CHECK kind IN (...)`
   and one new Zod schema.

Cristian's guidance was "structured fields per CBT step"; the
pragmatic interpretation is shape (3): the per-kind shape is defined
in TypeScript (Zod) and enforced on every write. The DB CHECK keeps
`kind` locked to the known seven so a malformed payload can't sneak in
under a typo'd discriminator.

**Tables landed in 0016:**

- `agos_mh_cbt_exercise`        — seedable catalog (one row per kind).
- `agos_mh_cbt_log`             — user's exercise sessions; `kind` is
                                  the discriminator; `data JSONB` holds
                                  the per-kind payload; CHECK keeps
                                  mood_before / mood_after in 1..10.
- `agos_mh_meditation_session`  — logged meditation sessions
                                  (manual / medito / plan source enum).
- `agos_mh_meditation_plan`     — weekly plan, unique on
                                  (user_id, week_start) so the helper
                                  can upsert by week.

Indexes match the access patterns: `(user_id, completed_at DESC)` for
both CBT logs and meditation sessions, plus
`(user_id, kind, completed_at DESC)` on CBT logs for the
filter-by-kind page.

Offline SQL verification (`alembic upgrade --sql 0015:0016`) generates
~181 lines of clean SQL with all `CREATE TABLE IF NOT EXISTS` /
`CREATE INDEX IF NOT EXISTS` guards and `ON CONFLICT (slug) DO NOTHING`
on the seed inserts.

### CBT exercise definitions seeded in the migration

Seven exercises are seeded in `0016_health_os_phase3.py` under
`INSERT … ON CONFLICT (slug) DO NOTHING`. Same reasoning as Phase 2's
journal prompts: exercises are schema-state, not user data; seeding
through repo code creates a race window; the migration's docstring is
the right place to land the source citations for legal/audit review.

Sources cited in the migration docstring:

- NHS — Self-help CBT guides (thought-record, worry-time,
  sleep-hygiene).
- US Department of Veterans Affairs (VA) — Cognitive Processing Therapy
  Patient Workbook (thought-record, behavioral-activation).
- Beck Institute — Cognitive Therapy Worksheet Packet (thought-record
  shape; SHAPE only — copy is paraphrased).
- National Institute of Mental Health (NIMH) — gratitude,
  values-clarification.
- VA / SAMHSA — 5-4-3-2-1 grounding (in wide public-health rotation;
  no canonical source).

All exercise descriptions and `instructions` JSONB content are
paraphrased and original. Sources cited in the migration docstring
form the audit chain.

### Meditation plan generator: rules-based, no LLM

`generateMeditationPlan(userId, opts)` in `repo.ts` produces a 7-day
plan from the static catalog using deterministic rules over the user's
recent state:

1. Read the last 14 mood entries and the mental-health profile
   (`stress_baseline`, `sleep_quality`).
2. If `opts.goal` is supplied, use it. Otherwise infer:
   - high anxiety (avg `anxiety_score` >= 7 OR `stress_baseline` >= 7)
     → `'stress'`
   - poor sleep (`sleep_quality === 'poor'` in profile or last 5 logs)
     → `'sleep'`
   - low energy (avg `energy_score` <= 4) → `'focus'`
   - default → `'general'`
3. Pick a session per day rotating through eligible catalog entries
   so the same slug doesn't repeat day after day.
4. Bias the last two slots toward `'sleep'` when the sleep signal is
   poor (winding down at week's end).

**Phase 3 explicitly prohibits LLM calls in plan generation.** That
lands in Phase 6. The rules-based generator is enough to ship a useful
plan today; it will be replaced (not amended) by the LLM-driven
version when Phase 6 arrives.

The pure planner is exposed as `planFromSignals(moods, profile, opts)`
so tests can drive it with synthetic signals without touching the DB.

### Meditation catalog: try Medito first, fall back to static

The Medito Foundation publishes a guided-meditation app, and the
Phase-3 planning doc flagged the API as unstable. Probes during this
build confirmed the instability — `meditofoundation.org/api`,
`meditofoundation.org/api/sessions`, `meditofoundation.org/api/v1/sessions`,
and `medito.app` all return 403 / 404 / DNS failures.

The shipped behavior:

- `GET /api/tiresias/agentic-os/health/meditation/catalog` tries the
  Medito API first, with a 4-second timeout per probe URL. The remote
  shape is normalized into the static-catalog shape if it ever returns
  data.
- On any non-2xx, network failure, malformed payload, or empty list
  → fall back to `MEDITATION_CATALOG` (a small curated set in
  `lib/agentic-os/health/meditation-catalog.ts`).
- The `source` field on the response (`'medito' | 'static'`) lets the
  UI label which catalog the user is seeing — useful when the Medito
  API does come back online.

The static catalog is the canonical source of truth in Phase 3. The
plan generator only references slugs from it; the planner does not
attempt to use remote data.

### Risk-flag engine: CBT-specific evaluator

`risk-flags.ts` adds `evaluateOnCbtLog(log, recentLogs, ctx)`:

- **Free-text crisis-language scan** over prose-likely fields inside
  the structured `data` payload (e.g. `automatic_thought`, `reflection`,
  worries array, gratitude entries) and `notes`. Mirrors the existing
  `evaluateOnFreeText` shape so the CBT BFF route also wraps the same
  fields via `withCrisisGuard` — the guard is the canonical emitter,
  the evaluator is here for repos / tests that need pure-function
  access. The route filters out duplicate crisis-language flags so we
  don't double-record.
- **Mood-drop pattern** across recent logs — when ≥3 logs in the last
  7 days show a drop of ≥3 from `mood_before` to `mood_after`, emit
  `cbt-mood-drop` (medium severity). The detector itself lives in
  `_shared/safety/cbt-mood-watch.ts` so other OSes can reuse it.

`grounding-54321` deliberately skips the free-text scan on its sense
items: those are short tokens (a single word like "lamp" or "cold")
and the regex bank's false-positive risk exceeds the value, same
trade-off Phase 2 made for mood-tag names.

### Crisis-guard application sites in Phase 3

Every free-text save in Phase 3 runs through `withCrisisGuard()`:

- `POST /api/tiresias/agentic-os/health/cbt`              → wraps
  prose-likely fields per kind + `notes`
- `PATCH /api/tiresias/agentic-os/health/cbt/[id]`        → same on
  validated update payload
- `POST /api/tiresias/agentic-os/health/meditation/sessions` →
  wraps `notes`
- `PATCH /api/tiresias/agentic-os/health/meditation/sessions/[id]` →
  wraps `notes`

Phase 1 invariant preserved: the wrapper is non-blocking. It fires a
`crisis-language` `RiskFlagInput` of `critical` severity in parallel
with the inner handler; the request still returns 201/200. Tests in
`phase3-cbt.test.ts` regression-cover this contract for the
thought-record `automatic_thought` field.

### Reusable patterns extracted to `_shared/`

Three new shared scaffolds, each pulled out because it's already
needed twice in Phase 3 and will be needed more by other OSes:

- `lib/agentic-os/_shared/safety/cbt-mood-watch.ts` —
  `detectMoodDropPattern(records, opts)`. Generic mood-delta watcher
  over `(moodBefore, moodAfter, at)` tuples. Other OSes that track
  pre/post mood (e.g. Filmmaker post-shoot debriefs, Maker workshop
  end-of-session) can wire it directly without depending on Health repo
  types.
- `components/agentic-os/_shared/checklist.tsx` — generic checklist UI
  with optional notes field. Health OS uses it for the Sleep Hygiene
  wizard; other OSes can wire it for any "tick what applies" form
  (Maker tooling readiness, Cyber detection-coverage gaps, Secure-Dev
  STRIDE checks).
- WizardForm (Phase 2 extract) — confirmed to hold up across the seven
  Phase 3 wizards. Thought-record uses it for 5 steps; Grounding uses
  it for 5 steps; the other five wizards run on a single page (the
  data is short enough that stepping is overhead). No fork was needed;
  WizardForm carried the load as designed.

The `_shared/safety/` directory now hosts both `crisis-guard.ts`
(Phase 1) and `cbt-mood-watch.ts` (Phase 3), establishing the
convention that cross-OS safety primitives live there.

### Out of scope (Phase 4 / 6)

- **Trends UI** — weekly mood/anxiety/energy charts with tag and CBT-log
  correlations is Phase 4 territory.
- **LLM-driven plan generation** — Phase 6 territory. The Phase 3
  planner is intentionally rule-based.
- **Audio playback for meditation sessions** — out of scope. The
  meditation catalog stores slugs and metadata only; users record
  manual or guided sessions but no audio is streamed from this server.
- **Encryption-at-rest** for `cbt_log.data` and
  `meditation_session.notes`. Both stay plaintext until the
  column-level KEK helper lands (same trade-off ADR-008 / ADR-009 made).

## References

- `packages/database/alembic/versions/0016_health_os_phase3.py`
- `apps/platform-web/src/lib/agentic-os/health/repo.ts` (CBT + meditation extensions)
- `apps/platform-web/src/lib/agentic-os/health/schemas.ts` (per-kind Zod + discriminated union)
- `apps/platform-web/src/lib/agentic-os/health/risk-flags.ts` (`evaluateOnCbtLog`)
- `apps/platform-web/src/lib/agentic-os/health/meditation-catalog.ts`
- `apps/platform-web/src/lib/agentic-os/_shared/safety/cbt-mood-watch.ts`
- `apps/platform-web/src/components/agentic-os/_shared/checklist.tsx`
- `apps/platform-web/src/components/agentic-os/health/cbt/wizards/*`
- `apps/platform-web/src/__tests__/agentic-os/health/phase3-{cbt,meditation}.test.ts`
- ADR-006 — Cross-OS audit log
- ADR-008 — Health OS Phase 1 foundation
- ADR-009 — Health OS Phase 2 tracking primitives
