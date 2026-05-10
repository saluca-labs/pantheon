# ADR-009: Health OS Phase 2 — Tracking Primitives

> Status: accepted (May 2026, platform/agentic-os, Workstream Health)

## Context

Phase 1 (ADR-008) established the Health OS foundation: mental-health
profile, consent ledger, risk-flag substrate, and a shared
crisis-language guard. Phase 2 adds the day-to-day tracking primitives
that turn the foundation into a usable mental-health surface: mood
check-ins, journal entries (optionally seeded by a CBT-derived prompt),
PSS-10 perceived-stress scoring, and a referral-resource evaluator that
surfaces SAMHSA / Psychology Today / 988 when symptom thresholds cross.

Phase 2 also extracts the first reusable patterns into
`apps/platform-web/src/components/agentic-os/_shared/` and
`apps/platform-web/src/lib/agentic-os/_shared/` so that the remaining
eight Agentic OS verticals can adopt them without re-deriving the
shape.

The questions Phase 2 needed to answer:

- Where does mood data live and how does it relate to journals?
- How are CBT-derived prompts seeded — code or migration?
- How does PSS-10 fit alongside PHQ-9 / GAD-7 in `screeners.ts`?
- What's the right shape for the cross-OS CRUD route helper that
  Phase 2 introduces?
- What's the safety contract for free-text writes (mood notes, journal
  body, journal title)?

## Decision

### Schema: additive, no breaking changes

`packages/database/alembic/versions/0015_health_os_phase2.py` is
strictly additive on top of Phase 1 (revision `0014_health_os_phase1`).
No Phase 1 column is renamed or dropped. The only delta to a Phase 1
table is a new CHECK constraint on `agos_health_screeners.screener`
that locks the column to `phq9 / gad7 / pss`; the constraint is added
inside an idempotent `DO $$ ... IF NOT EXISTS ... END$$` block so
re-applies are safe.

New tables (all `CREATE TABLE IF NOT EXISTS`):

- `agos_mh_mood_entry` — mood/energy/anxiety scores (1..10, CHECK-bounded),
  sleep_quality (reuses Phase 1 enum vocabulary), notes, entry_at.
- `agos_mh_mood_tag` — user-scoped tags, unique on (user_id, name).
  Color is a free string (UI decides the palette).
- `agos_mh_mood_entry_tag` — m2m join with cascading deletes.
- `agos_mh_journal_prompt` — seeded catalog of CBT-derived prompts.
- `agos_mh_journal_entry` — body + optional `prompt_id` FK, optional
  title.

Indexes match the access patterns: `(user_id, entry_at DESC)` for both
mood and journal lists, `(tenant_id, ...)` for analytics.

### CBT prompt seeding lives in the migration

The seed catalog (~18 prompts) ships inside `0015_health_os_phase2.py`
under an `INSERT … ON CONFLICT (slug) DO NOTHING` clause. Three
reasons:

- The prompts ARE schema-state, not user data — they're the same on
  every install.
- Seeding through repo code on first user access creates a race window
  (multiple users hitting `/journal` simultaneously) and leaves the
  seed dependent on traffic. Migration-time seeding is deterministic.
- It puts the source citations (NHS / VA / NIMH) in the migration
  docstring, where the legal/audit review process picks them up.

The migration's docstring lists the source for each prompt category
(see ADR-008's MIT/no-GPL policy). The migration is the audit trail.

The starter mood-tag set (anxious, focused, tired, energetic, lonely,
connected) is seeded LAZILY on first user access in `listMoodTags`
because tags are user-scoped, not global. The migration cannot seed
per-user content.

### PSS-10: a third public-domain screener

`screeners.ts` now includes a `PSS10` definition alongside `PHQ9` and
`GAD7`. The five-point PSS scale (0..4) and reverse-scoring of items
4, 5, 7, 8 are encoded in a dedicated `scorePss10()` helper that
returns `{ totalScore, severity: 'low'|'moderate'|'high' }`. The
project-chosen severity bands are:

- `low`      total < 14
- `moderate` 14..26
- `high`     total ≥ 27

`scoreScreener('pss', ...)` lifts the result into the shared
`ScreenerResult` envelope (mapping `high → severe`, `moderate →
moderate`, `low → minimal`) so downstream code that already takes a
`(score, severity, crisisFlag)` tuple keeps working without changes.
`crisisFlag` is always false for PSS-10 — perceived stress alone is
not a clinical crisis signal; the referral evaluator (below) handles
the surfacing.

The `evaluateOnScreener` engine emits:

- `pss-severe`   (severity high) at score ≥ 27
- `pss-moderate` (severity low)  at score 14..26

### Referral evaluator: surface, never block

A new `evaluateReferralPrompt({ phq9?, gad7?, pss? })` returns a
`ReferralPrompt` record with `shouldSurface`, `reasons`, the standard
nudge ("Reaching out is a strong move."), and a fixed list of three
public, non-clinical resources:

- SAMHSA National Helpline (`samhsa.gov`)
- Psychology Today therapist finder (`psychologytoday.com/us/therapists`)
- 988 Suicide & Crisis Lifeline (`988lifeline.org`)

Thresholds: PHQ-9 ≥ 10, GAD-7 ≥ 10, PSS ≥ 14. The evaluator returns
the resource list even when `shouldSurface` is false, so callers that
want to render an "always available" card can do so without
conditional logic.

This is intentionally **separate** from the existing crisis-banner
(988 + Crisis Text Line) used for active suicidal-ideation matches.
The referral block is a softer, "you might benefit from talking to
someone" surface; the crisis banner is the "right now" wall.

### Crisis-guard application sites in Phase 2

Every free-text save in Phase 2 runs through `withCrisisGuard()`:

- `POST /api/tiresias/agentic-os/health/mood`            → wraps `notes`
- `PATCH /api/tiresias/agentic-os/health/mood/[id]`      → wraps `notes`
- `POST /api/tiresias/agentic-os/health/journal`         → wraps `title` + `body`
- `PATCH /api/tiresias/agentic-os/health/journal/[id]`   → wraps `title` + `body`

The wrapper is non-blocking by contract (Phase 1 invariant) — it fires
a `crisis-language` `RiskFlagInput` of `critical` severity in parallel
with the inner handler, and the request still returns 201/200 on
success. Tests in `phase2-journal.test.ts` regression-cover this
contract for journal saves; tests in `phase2-mood.test.ts` cover it
for mood notes.

`mood-tags` is the one mutation that does NOT run the guard — tag
names are short and not free-form prose, so the false-positive risk
of the regex bank exceeds the value.

### Reusable patterns extracted to `_shared/`

Three new shared scaffolds, each pulled out because they're already
needed twice in Phase 2 and will be needed more times by other OSes:

- `components/agentic-os/_shared/wizard-form.tsx` — multi-step form
  pattern with URL-driven state (`?step=`). The journal-new flow uses
  it as a single-step today; Phase 3 CBT mini-wizards will use it for
  3–5 step flows.
- `components/agentic-os/_shared/data-table.tsx` — generic compact
  list-of-rows component with column definitions, optional row links,
  and an empty-state slot. Used by mood-entry-list; ready for journal
  entries, screener history, and future audit views.
- `lib/agentic-os/_shared/crud-route.ts` — `createCrudRoute({
  schema, resolveUser, opAction, consentCheck, list, create })` Zod-
  validated GET/POST handler factory. Used by the journal collection
  endpoint to demonstrate the pattern. **Phase 1's BFF routes were
  intentionally NOT migrated** — they work, and the factory's job is
  to be the easier path forward, not to chase a refactor diff.

The factory does not (yet) cover dynamic routes (`/[id]`), pagination,
or multi-step `withCrisisGuard` wrapping. Routes that need those keep
hand-writing handlers and call `recordAudit` / `withCrisisGuard`
directly. When Phase 3+ surfaces enough call sites, the factory will
absorb the next layer.

## Phase 1 → Phase 2 migration story

No breaking changes. The migration sequence is:

1. `0014_health_os_phase1` lands `agos_mh_profile`, `agos_health_consent`,
   `agos_health_risk_flag`.
2. `0015_health_os_phase2` lands the five new mental-health tables
   plus the screener-kind CHECK on the existing
   `agos_health_screeners`.

`agos_health_screeners` is a Phase 1 table from `0003_agentic_os.py`;
the `screener` column was open-text before Phase 2. Adding the CHECK
constraint with `IF NOT EXISTS` (via the DO block) is safe on a fresh
database and on a database that already has data — every existing row
already has `screener IN ('phq9','gad7')` because the BFF route only
ever wrote those two values.

Offline SQL verification (`alembic upgrade --sql 0014:0015`) generates
~207 lines of clean SQL with all `CREATE TABLE IF NOT EXISTS` /
`CREATE INDEX IF NOT EXISTS` guards and the constraint-add wrapped in
the idempotent DO block.

## Out of scope (Phase 3 / 4)

- CBT mini-wizards (multi-step thought-record forms with structured
  field capture instead of free-text body). Will use `wizard-form.tsx`.
- Meditation / breathwork timers.
- Trends UI: weekly mood/anxiety/energy charts with tag correlations.
  The mood page surfaces a "Coming soon" placeholder.
- Encryption-at-rest of `mood_entry.notes` and `journal_entry.body`.
  Both stay plaintext until a column-level KEK helper lands (same
  trade-off ADR-008 made for `agos_mh_profile.med_notes`).

## References

- `packages/database/alembic/versions/0015_health_os_phase2.py`
- `apps/platform-web/src/lib/agentic-os/health/screeners.ts`
- `apps/platform-web/src/lib/agentic-os/health/risk-flags.ts`
- `apps/platform-web/src/lib/agentic-os/health/repo.ts`
- `apps/platform-web/src/lib/agentic-os/_shared/crud-route.ts`
- `apps/platform-web/src/components/agentic-os/_shared/{wizard-form,data-table}.tsx`
- `apps/platform-web/src/__tests__/agentic-os/health/phase2-{mood,journal}.test.ts`
- ADR-006 — Cross-OS audit log (the `recordAudit` contract used here)
- ADR-008 — Health OS Phase 1 foundation
