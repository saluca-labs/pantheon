"""Health OS Phase 3 — CBT exercises catalog + meditation tracking.

Revision ID: 0016_health_os_phase3
Revises: 0015_health_os_phase2
Create Date: 2026-05-10

Phase 3 ships the heaviest UI section of the Health OS buildout: the
seven Cognitive Behavioral Therapy (CBT) mini-wizards plus a
meditation tracker (sessions + a generated weekly plan). It is
strictly additive on top of Phase 2 (revision ``0015_health_os_phase2``);
no Phase 1 or Phase 2 column is renamed or dropped.

Tables introduced
-----------------
- ``agos_mh_cbt_exercise``        — seedable catalog of CBT exercise
                                    definitions. Slug is stable across
                                    deploys and used for the wizard
                                    routes (/cbt/<slug>/new).
- ``agos_mh_cbt_log``             — user's exercise sessions. ONE row
                                    per attempt regardless of kind;
                                    per-kind structured fields live in
                                    ``data JSONB`` (see "Schema decision"
                                    in ADR-010).
- ``agos_mh_meditation_session``  — logged meditation sessions (manual
                                    or guided via Medito catalog).
- ``agos_mh_meditation_plan``     — generated weekly plan (rules-based,
                                    NO LLM in Phase 3). Unique on
                                    ``(user_id, week_start)`` so the
                                    helper can upsert by week.

Schema decision: single CBT log table + JSONB per-kind data
-----------------------------------------------------------
The seven CBT kinds (thought-record, behavioral-activation, worry-time,
grounding-54321, gratitude, values-clarification, sleep-hygiene) each
collect a different structured payload. We considered three shapes:

1. Seven dedicated tables. Most type-safe at the DDL layer, but the
   listing/filtering/recent-logs UI would have to UNION them and all
   read paths get N branches. ~30+ columns total.
2. One table, structured per-kind columns. Sparse — 70%+ of any row's
   columns would be NULL. Also makes the CHECK constraint untenable.
3. **One table, ``kind`` discriminator + ``data JSONB`` payload** —
   chosen. Validation moves to per-kind Zod schemas at the BFF layer
   (`schemas.ts` in this phase). The DDL stays trivial; the listing UI
   is a single SELECT; adding an eighth kind is a single line in the
   ``CHECK`` plus a Zod schema.

Cristian's guidance was "structured fields per CBT step"; the
pragmatic interpretation is shape (3), with the per-kind shape
defined in TypeScript and enforced on every write. The DB CHECK keeps
``kind`` locked to the known seven — adding a kind requires a one-line
migration, which is the right migration cost for a clinical-content
addition.

CBT exercise sources (all paraphrased; cited for legal/audit chain)
-------------------------------------------------------------------
All exercise definitions, instructions, and field shapes are
paraphrased from public-domain or government-published clinical
self-help materials. No GPL or restrictive-license content is
introduced.

- NHS — "Self-help cognitive behavioural therapy (CBT) techniques"
  https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/
  - thought-record (catch-it / check-it / change-it pattern)
  - worry-time (postpone-and-process pattern)
  - sleep-hygiene checklist

- US Department of Veterans Affairs (VA) — "Cognitive Processing Therapy
  Patient Workbook" (public domain, distributed via va.gov)
  https://www.mentalhealth.va.gov/coe/cih-visn2/Documents/Patient_Education_Handouts/Cognitive_Processing_Therapy_Patient_Workbook_Version_3.pdf
  - thought-record evidence-for / evidence-against / balanced-thought
  - behavioral-activation pleasure / mastery / connection scheduling

- National Institute of Mental Health (NIMH) — public-domain educational
  materials.  https://www.nimh.nih.gov/health/topics
  - gratitude (three good things)
  - values-clarification (domains × importance × current-alignment)

- Beck Institute — "Cognitive Therapy Worksheet Packet" (educational use
  permitted with attribution; the SHAPE of the thought-record is
  paraphrased, not the worksheet content itself).
  https://beckinstitute.org/get-informed/tools-and-resources/

- VA / SAMHSA — grounding-54321 (5-4-3-2-1 senses-based grounding;
  in wide public-health rotation, no single canonical source).
  https://www.samhsa.gov/

License note: All DDL is original work under MIT. Exercise descriptions
and instructions are paraphrased and original; sources cited above
form the audit chain.

Idempotency: All DDL uses ``CREATE TABLE IF NOT EXISTS`` /
``CREATE INDEX IF NOT EXISTS``; seed inserts use
``ON CONFLICT (slug) DO NOTHING`` — re-applies are safe.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0016_health_os_phase3"
down_revision: Union[str, None] = "0015_health_os_phase2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- CBT exercise catalog -----------------------------------------------------
-- Seedable, stable across deploys. ``kind`` matches the discriminator on
-- ``agos_mh_cbt_log.kind`` and is the same enum the per-kind Zod schema
-- selects on at the BFF layer. ``instructions`` is JSONB rendering
-- metadata for the wizard (step labels, field hints) — UI reads it,
-- DB ignores its shape.
CREATE TABLE IF NOT EXISTS agos_mh_cbt_exercise (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL,
    kind          TEXT NOT NULL,
    citation      TEXT,
    instructions  JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_seed       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_cbt_exercise_kind_enum
        CHECK (kind IN (
            'thought-record',
            'behavioral-activation',
            'worry-time',
            'grounding-54321',
            'gratitude',
            'values-clarification',
            'sleep-hygiene'
        ))
);
CREATE INDEX IF NOT EXISTS agos_mh_cbt_exercise_kind_idx
    ON agos_mh_cbt_exercise (kind);

-- CBT log ------------------------------------------------------------------
-- One row per exercise attempt. ``kind`` is the discriminator; ``data`` is
-- the per-kind structured payload validated by a Zod schema at the BFF
-- before write. ``mood_before`` / ``mood_after`` are 1..10 to align with
-- ``agos_mh_mood_entry.mood_score``; both are optional because not every
-- kind asks for them (e.g. gratitude / sleep-hygiene).
CREATE TABLE IF NOT EXISTS agos_mh_cbt_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL,
    tenant_id     UUID NOT NULL,
    kind          TEXT NOT NULL,
    exercise_id   UUID REFERENCES agos_mh_cbt_exercise(id) ON DELETE SET NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ,
    mood_before   INT,
    mood_after    INT,
    data          JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_cbt_log_kind_enum
        CHECK (kind IN (
            'thought-record',
            'behavioral-activation',
            'worry-time',
            'grounding-54321',
            'gratitude',
            'values-clarification',
            'sleep-hygiene'
        )),
    CONSTRAINT agos_mh_cbt_log_mood_before_range
        CHECK (mood_before IS NULL OR (mood_before >= 1 AND mood_before <= 10)),
    CONSTRAINT agos_mh_cbt_log_mood_after_range
        CHECK (mood_after IS NULL OR (mood_after >= 1 AND mood_after <= 10))
);
CREATE INDEX IF NOT EXISTS agos_mh_cbt_log_user_completed_idx
    ON agos_mh_cbt_log (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS agos_mh_cbt_log_user_kind_idx
    ON agos_mh_cbt_log (user_id, kind, completed_at DESC);
CREATE INDEX IF NOT EXISTS agos_mh_cbt_log_tenant_idx
    ON agos_mh_cbt_log (tenant_id, completed_at DESC);

-- Meditation session -------------------------------------------------------
-- ``source`` distinguishes 'medito' (guided via Medito catalog),
-- 'manual' (user logged a free-form session) and 'plan' (followed a
-- generated plan slot). ``source_ref`` is the Medito session slug for
-- 'medito' or NULL otherwise.
CREATE TABLE IF NOT EXISTS agos_mh_meditation_session (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL,
    tenant_id     UUID NOT NULL,
    source        TEXT NOT NULL,
    source_ref    TEXT,
    duration_min  INT NOT NULL,
    completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    mood_before   INT,
    mood_after    INT,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_meditation_session_source_enum
        CHECK (source IN ('medito', 'manual', 'plan')),
    CONSTRAINT agos_mh_meditation_session_duration_range
        CHECK (duration_min > 0 AND duration_min <= 240),
    CONSTRAINT agos_mh_meditation_session_mood_before_range
        CHECK (mood_before IS NULL OR (mood_before >= 1 AND mood_before <= 10)),
    CONSTRAINT agos_mh_meditation_session_mood_after_range
        CHECK (mood_after IS NULL OR (mood_after >= 1 AND mood_after <= 10))
);
CREATE INDEX IF NOT EXISTS agos_mh_meditation_session_user_completed_idx
    ON agos_mh_meditation_session (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS agos_mh_meditation_session_tenant_idx
    ON agos_mh_meditation_session (tenant_id, completed_at DESC);

-- Meditation plan ----------------------------------------------------------
-- One row per (user, ISO week start). ``plan`` is an array of day-slots
-- shaped { day, session_slug, duration_min, focus }. Generated by the
-- rules-based helper in ``repo.generateMeditationPlan`` — NO LLM in
-- Phase 3 (LLM-driven plans land in Phase 6 per ADR-010).
CREATE TABLE IF NOT EXISTS agos_mh_meditation_plan (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    tenant_id   UUID NOT NULL,
    week_start  DATE NOT NULL,
    plan        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agos_mh_meditation_plan_user_week_uidx
    ON agos_mh_meditation_plan (user_id, week_start);
CREATE INDEX IF NOT EXISTS agos_mh_meditation_plan_tenant_idx
    ON agos_mh_meditation_plan (tenant_id, week_start DESC);

-- Seed CBT exercise catalog ------------------------------------------------
-- Seven kinds, one canonical exercise per kind. Slug is stable across
-- deploys; ``instructions`` carries the wizard step labels the UI uses.
INSERT INTO agos_mh_cbt_exercise (slug, name, description, kind, citation, instructions) VALUES
    ('thought-record',
     'Thought record',
     'Catch a distressing automatic thought, weigh the evidence on both sides, and rewrite it in a more balanced form.',
     'thought-record',
     'NHS — Self-help CBT guides; VA — Cognitive Processing Therapy Patient Workbook; Beck Institute — Cognitive Therapy Worksheet Packet (paraphrased).',
     '{"steps":[{"id":"situation","label":"Situation"},{"id":"thought","label":"Automatic thought"},{"id":"evidence","label":"Evidence"},{"id":"balanced","label":"Balanced thought"},{"id":"mood","label":"Mood check"}]}'::jsonb),
    ('behavioral-activation',
     'Behavioral activation',
     'Schedule one small activity that gives pleasure or mastery, then reflect on how it landed.',
     'behavioral-activation',
     'NHS — Depression self-help guide; VA — Cognitive Processing Therapy Patient Workbook (paraphrased).',
     '{"steps":[{"id":"activity","label":"Pick activity"},{"id":"schedule","label":"Schedule"},{"id":"reflect","label":"Reflect"}]}'::jsonb),
    ('worry-time',
     'Worry time',
     'Schedule a fixed window for your worries. List them, set a timer, and reflect when the window closes.',
     'worry-time',
     'NHS — Anxiety self-help guide (paraphrased "postpone and process" pattern).',
     '{"steps":[{"id":"setup","label":"Schedule + duration"},{"id":"list","label":"List worries"},{"id":"reflect","label":"Reflect"}]}'::jsonb),
    ('grounding-54321',
     '5-4-3-2-1 grounding',
     'Anchor yourself in the present by naming five things you see, four you feel, three you hear, two you smell, one you taste.',
     'grounding-54321',
     'VA / SAMHSA — grounding technique in public-health rotation (paraphrased).',
     '{"steps":[{"id":"see","label":"5 things you see"},{"id":"feel","label":"4 things you feel"},{"id":"hear","label":"3 things you hear"},{"id":"smell","label":"2 things you smell"},{"id":"taste","label":"1 thing you taste"}]}'::jsonb),
    ('gratitude',
     'Three good things',
     'Name three things, big or small, that went well today and one sentence on why each mattered.',
     'gratitude',
     'NIMH — Mental health topics; gratitude-journaling research (Emmons & McCullough 2003) — paraphrased.',
     '{"steps":[{"id":"entries","label":"Three good things"}]}'::jsonb),
    ('values-clarification',
     'Values clarification',
     'For each life domain that matters, rate its importance and how aligned your recent actions have been, then pick one concrete action.',
     'values-clarification',
     'VA — Cognitive Processing Therapy Patient Workbook; NIMH — public-domain materials (paraphrased).',
     '{"steps":[{"id":"domains","label":"Pick domains"},{"id":"rate","label":"Rate importance + alignment"},{"id":"action","label":"One action per domain"}]}'::jsonb),
    ('sleep-hygiene',
     'Sleep hygiene check',
     'Walk through a checklist of sleep-hygiene habits and note where things are slipping.',
     'sleep-hygiene',
     'NHS — Sleep self-help guide (paraphrased).',
     '{"steps":[{"id":"checklist","label":"Run the checklist"},{"id":"notes","label":"Notes"}]}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_mh_meditation_plan_tenant_idx;
DROP INDEX IF EXISTS agos_mh_meditation_plan_user_week_uidx;
DROP TABLE IF EXISTS agos_mh_meditation_plan;

DROP INDEX IF EXISTS agos_mh_meditation_session_tenant_idx;
DROP INDEX IF EXISTS agos_mh_meditation_session_user_completed_idx;
DROP TABLE IF EXISTS agos_mh_meditation_session;

DROP INDEX IF EXISTS agos_mh_cbt_log_tenant_idx;
DROP INDEX IF EXISTS agos_mh_cbt_log_user_kind_idx;
DROP INDEX IF EXISTS agos_mh_cbt_log_user_completed_idx;
DROP TABLE IF EXISTS agos_mh_cbt_log;

DROP INDEX IF EXISTS agos_mh_cbt_exercise_kind_idx;
DROP TABLE IF EXISTS agos_mh_cbt_exercise;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
