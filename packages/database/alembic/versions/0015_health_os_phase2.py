"""Health OS Phase 2 — mental-health tracking primitives.

Revision ID: 0015_health_os_phase2
Revises: 0014_health_os_phase1
Create Date: 2026-05-10

Phase 2 adds the mental-health tracking primitives that sit on top of
the Phase 1 foundation: per-day mood entries, user-managed mood tags,
and free-form journal entries (optionally seeded by a CBT-derived
prompt). It also extends the screener-kind allowlist to include
PSS-10 (Perceived Stress Scale).

Tables introduced
-----------------
- ``agos_mh_mood_entry``         — per-event mood snapshot (mood,
                                   energy, anxiety, sleep_quality, notes).
- ``agos_mh_mood_tag``           — user-scoped mood tags (e.g. anxious,
                                   focused, tired). Unique on (user, name).
- ``agos_mh_mood_entry_tag``     — m2m join between entries and tags.
- ``agos_mh_journal_entry``      — reflective journal entry with optional
                                   ``prompt_id`` reference.
- ``agos_mh_journal_prompt``     — seedable catalog of CBT-derived prompts
                                   sourced from public-domain clinical
                                   self-help materials (NHS / VA / NIMH).

Schema deltas
-------------
- ``agos_health_screeners`` gains a CHECK constraint on ``screener``
  enumerating ``phq9``, ``gad7``, ``pss``. The pre-Phase-2 column was
  open-text; this adds the allowlist explicitly so the database — not
  just the BFF layer — enforces the enum.

Naming convention
-----------------
Continues the Phase 1 split:
- ``agos_mh_*``     — mental-health-vertical-only tables.
- ``agos_health_*`` — tables shared between physical and mental health.

Encryption
----------
``mood_entry.notes`` and ``journal_entry.body`` are stored as plaintext
TEXT for now, consistent with ADR-008 and the same plaintext fallback
used by ``agos_mh_profile.med_notes`` in Phase 1. When a column-level
KEK helper lands these columns should be migrated to ciphertext +
``dek_id``. Until then the crisis-language guard runs over the values
on every write so a risk flag is still emitted in parallel.

Prompt seed sources (recorded for legal/audit review)
-----------------------------------------------------
All prompts are paraphrased from public-domain or government-published
clinical self-help materials. No GPL or restrictive-license content is
introduced.

- NHS — "How to manage anxiety: anxiety self-help guide"
  https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/
  - thought-record / catch-it-check-it-change-it pattern
  - gratitude / values reflection prompts

- US Department of Veterans Affairs (VA) — "Cognitive Processing Therapy
  Patient Workbook" (public domain, distributed via va.gov)
  https://www.mentalhealth.va.gov/coe/cih-visn2/Documents/Patient_Education_Handouts/Cognitive_Processing_Therapy_Patient_Workbook_Version_3.pdf
  - thought-record / cognitive-distortion identification
  - behavioral-activation prompts

- National Institute of Mental Health (NIMH) — public-domain
  educational materials
  https://www.nimh.nih.gov/health/topics
  - values-clarification / self-compassion prompts

License note: All DDL is original work under MIT. Prompt copy is
paraphrased and original; sources cited above for audit chain.

Idempotency: All DDL uses ``CREATE TABLE IF NOT EXISTS`` /
``CREATE INDEX IF NOT EXISTS`` / ``DO $$ ... EXCEPTION`` blocks for
constraint adds, matching the project convention.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0015_health_os_phase2"
down_revision: Union[str, None] = "0014_health_os_phase1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- Mood entry ---------------------------------------------------------------
-- One row per mood check-in event. Numeric scores are bounded 1..10 via
-- CHECK constraints; sleep_quality reuses the Phase 1 enum vocabulary
-- ('poor' / 'fair' / 'good' / 'excellent') but is NOT FK-constrained to
-- the profile so a user can record a mood without a profile row.
CREATE TABLE IF NOT EXISTS agos_mh_mood_entry (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    tenant_id       UUID NOT NULL,
    mood_score      INT,
    energy_score    INT,
    anxiety_score   INT,
    sleep_quality   TEXT,
    notes           TEXT,
    entry_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_mood_entry_mood_range
        CHECK (mood_score IS NULL OR (mood_score >= 1 AND mood_score <= 10)),
    CONSTRAINT agos_mh_mood_entry_energy_range
        CHECK (energy_score IS NULL OR (energy_score >= 1 AND energy_score <= 10)),
    CONSTRAINT agos_mh_mood_entry_anxiety_range
        CHECK (anxiety_score IS NULL OR (anxiety_score >= 1 AND anxiety_score <= 10)),
    CONSTRAINT agos_mh_mood_entry_sleep_quality_enum
        CHECK (sleep_quality IS NULL OR sleep_quality IN ('poor','fair','good','excellent'))
);
CREATE INDEX IF NOT EXISTS agos_mh_mood_entry_user_entry_idx
    ON agos_mh_mood_entry (user_id, entry_at DESC);
CREATE INDEX IF NOT EXISTS agos_mh_mood_entry_tenant_idx
    ON agos_mh_mood_entry (tenant_id, entry_at DESC);

-- Mood tag -----------------------------------------------------------------
-- User-scoped tag dictionary; (user_id, name) is unique. Color is a free
-- string (hex / Tailwind class / etc.) — the UI decides how to render.
CREATE TABLE IF NOT EXISTS agos_mh_mood_tag (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    tenant_id   UUID NOT NULL,
    name        TEXT NOT NULL,
    color       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agos_mh_mood_tag_user_name_uidx
    ON agos_mh_mood_tag (user_id, name);
CREATE INDEX IF NOT EXISTS agos_mh_mood_tag_tenant_idx
    ON agos_mh_mood_tag (tenant_id);

-- Mood entry <-> tag join --------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_mh_mood_entry_tag (
    mood_entry_id  UUID NOT NULL REFERENCES agos_mh_mood_entry(id) ON DELETE CASCADE,
    tag_id         UUID NOT NULL REFERENCES agos_mh_mood_tag(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (mood_entry_id, tag_id)
);
CREATE INDEX IF NOT EXISTS agos_mh_mood_entry_tag_tag_idx
    ON agos_mh_mood_entry_tag (tag_id);

-- Journal prompt -----------------------------------------------------------
-- Seedable catalog. ``slug`` is the stable id used in URLs (?prompt=<slug>);
-- ``is_seed`` distinguishes seeded prompts from any future user-authored
-- ones (out of scope for Phase 2 but reserved here).
CREATE TABLE IF NOT EXISTS agos_mh_journal_prompt (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    category    TEXT NOT NULL,
    prompt      TEXT NOT NULL,
    source      TEXT,
    is_seed     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_journal_prompt_category_enum
        CHECK (category IN (
            'cbt-thought-record',
            'gratitude',
            'values-clarification',
            'behavioral-activation',
            'self-compassion'
        ))
);
CREATE INDEX IF NOT EXISTS agos_mh_journal_prompt_category_idx
    ON agos_mh_journal_prompt (category);

-- Journal entry ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_mh_journal_entry (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    tenant_id    UUID NOT NULL,
    prompt_id    UUID REFERENCES agos_mh_journal_prompt(id) ON DELETE SET NULL,
    title        TEXT,
    body         TEXT NOT NULL,
    entry_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_mh_journal_entry_user_entry_idx
    ON agos_mh_journal_entry (user_id, entry_at DESC);
CREATE INDEX IF NOT EXISTS agos_mh_journal_entry_tenant_idx
    ON agos_mh_journal_entry (tenant_id, entry_at DESC);

-- Screener-kind allowlist --------------------------------------------------
-- The Phase 1 ``agos_health_screeners.screener`` column was open-text. We
-- now lock it to the supported set: phq9 / gad7 / pss. Add the constraint
-- inside a DO block so re-applies don't error if it already exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agos_health_screeners_kind_enum'
    ) THEN
        ALTER TABLE agos_health_screeners
            ADD CONSTRAINT agos_health_screeners_kind_enum
            CHECK (screener IN ('phq9','gad7','pss'));
    END IF;
END$$;

-- Seed prompts --------------------------------------------------------------
-- ON CONFLICT (slug) DO NOTHING keeps the migration idempotent.
INSERT INTO agos_mh_journal_prompt (slug, category, prompt, source) VALUES
    -- CBT thought-record (NHS / VA cognitive processing therapy)
    ('thought-record-event',
     'cbt-thought-record',
     'Describe the situation that triggered this thought. What were you doing, where were you, and who else was there? Stick to observable facts.',
     'NHS — Anxiety self-help guide'),
    ('thought-record-automatic',
     'cbt-thought-record',
     'What automatic thought went through your mind in that moment? Write it as a sentence beginning with "I thought…".',
     'NHS — Anxiety self-help guide'),
    ('thought-record-evidence-for',
     'cbt-thought-record',
     'What evidence supports the automatic thought? List concrete observations, not feelings.',
     'VA — Cognitive Processing Therapy Patient Workbook'),
    ('thought-record-evidence-against',
     'cbt-thought-record',
     'What evidence contradicts the automatic thought? Have there been times the opposite was true?',
     'VA — Cognitive Processing Therapy Patient Workbook'),
    ('thought-record-balanced',
     'cbt-thought-record',
     'Write a more balanced thought that accounts for both sets of evidence. How does it feel compared to the automatic one?',
     'VA — Cognitive Processing Therapy Patient Workbook'),
    ('thought-record-action',
     'cbt-thought-record',
     'Given the balanced thought, what is one small action you can take in the next 24 hours?',
     'NHS — Anxiety self-help guide'),
    -- Gratitude (NHS / NIMH)
    ('gratitude-three-good-things',
     'gratitude',
     'Name three things that went well today, however small. For each, write one sentence about why it mattered.',
     'NIMH — Mental health topics'),
    ('gratitude-person',
     'gratitude',
     'Think of one person you appreciate. What specifically did they do, and how has it affected you?',
     'NIMH — Mental health topics'),
    ('gratitude-self',
     'gratitude',
     'Name one thing you did this week that you''re proud of, even if no one else noticed.',
     'NHS — Mental wellbeing'),
    -- Values clarification (NIMH / VA)
    ('values-most-important',
     'values-clarification',
     'List the three values you most want to live by right now (e.g. honesty, courage, family, growth). What does each look like in practice?',
     'NIMH — Mental health topics'),
    ('values-this-week',
     'values-clarification',
     'Pick one of those values. When did you act in line with it this week? When did you not?',
     'VA — Cognitive Processing Therapy Patient Workbook'),
    ('values-tradeoff',
     'values-clarification',
     'Describe a recent decision that pulled you between two values. How did you choose, and how do you feel about it now?',
     'VA — Cognitive Processing Therapy Patient Workbook'),
    -- Behavioral activation (NHS / VA)
    ('behavioral-activation-pleasure',
     'behavioral-activation',
     'List two activities that used to bring you pleasure but you''ve stopped doing. Pick one and schedule a 20-minute slot for it this week.',
     'NHS — Depression self-help guide'),
    ('behavioral-activation-mastery',
     'behavioral-activation',
     'Name one thing you can do today that gives a sense of accomplishment, even if it''s small (cleaning a desk, finishing one task).',
     'NHS — Depression self-help guide'),
    ('behavioral-activation-connection',
     'behavioral-activation',
     'Identify one person you''d like to reach out to this week. What would you say in a short message? Draft it here.',
     'VA — Cognitive Processing Therapy Patient Workbook'),
    -- Self-compassion (NIMH)
    ('self-compassion-friend',
     'self-compassion',
     'A close friend tells you about a struggle you''re currently having. What would you say to them? Try saying that to yourself.',
     'NIMH — Mental health topics'),
    ('self-compassion-common-humanity',
     'self-compassion',
     'Where in your life are you treating a normal, shared human experience as if it were a personal failure? Name it without judgment.',
     'NIMH — Mental health topics'),
    ('self-compassion-mindful',
     'self-compassion',
     'What emotion are you feeling right now? Describe it as if you were observing it from outside, with curiosity rather than evaluation.',
     'NIMH — Mental health topics')
ON CONFLICT (slug) DO NOTHING;
"""


_DOWNGRADE_SQL = """
-- Constraint added in upgrade — drop if present.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agos_health_screeners_kind_enum'
    ) THEN
        ALTER TABLE agos_health_screeners
            DROP CONSTRAINT agos_health_screeners_kind_enum;
    END IF;
END$$;

DROP INDEX IF EXISTS agos_mh_journal_entry_tenant_idx;
DROP INDEX IF EXISTS agos_mh_journal_entry_user_entry_idx;
DROP TABLE IF EXISTS agos_mh_journal_entry;

DROP INDEX IF EXISTS agos_mh_journal_prompt_category_idx;
DROP TABLE IF EXISTS agos_mh_journal_prompt;

DROP INDEX IF EXISTS agos_mh_mood_entry_tag_tag_idx;
DROP TABLE IF EXISTS agos_mh_mood_entry_tag;

DROP INDEX IF EXISTS agos_mh_mood_tag_tenant_idx;
DROP INDEX IF EXISTS agos_mh_mood_tag_user_name_uidx;
DROP TABLE IF EXISTS agos_mh_mood_tag;

DROP INDEX IF EXISTS agos_mh_mood_entry_tenant_idx;
DROP INDEX IF EXISTS agos_mh_mood_entry_user_entry_idx;
DROP TABLE IF EXISTS agos_mh_mood_entry;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
