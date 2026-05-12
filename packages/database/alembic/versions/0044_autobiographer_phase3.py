"""Autobiographer OS Phase 3 — voice samples and voice profiles.

Revision ID: 0044_autobiographer_phase3
Revises: 0043_autobiographer_phase2
Create Date: 2026-05-11

Phase 3 of Autobiographer OS introduces the **voice samples** capture layer
and the versioned **voice profile** that the Phase 7 chapter_drafter will
consume. The plan is anchored in
``apps/platform-web/content/agentic-os/autobiographer.md`` (Phase 3 section).

New tables (all under ``agos_autobiographer_*``)::

    agos_autobiographer_voice_samples   -- user-curated "sounds like me" samples
    agos_autobiographer_voice_profiles  -- versioned aggregated style profile

Voice profile shape (locked decision)
-------------------------------------
The voice profile is stored as **structured JSON style markers** (cadence,
vocabulary, common phrases, syntactic preferences, example openings) — not a
fine-tuned model and not a raw embedding. The Phase 7 drafter also retrieves
1-2 short verbatim sample excerpts at generation time (RAG-flavored
few-shot), so the profile is the spine and the samples are the flesh.

The legacy doc's three-prompt chain (analyze-sample → aggregate-profile →
generate-with-profile) maps directly onto this: stage 1 + 2 live in the
Phase 3 voice builder, stage 3 lives in the Phase 7 chapter_drafter.

memory-backed samples
---------------------
``voice_samples.memory_id`` is nullable. When the author marks an existing
memory as "this sounds like me", the sample row is created with
``memory_id`` pointing at the memory; deleting the memory CASCADES the
sample. Free-typed samples leave ``memory_id`` NULL and survive
independently. A partial index on ``(memory_id) WHERE memory_id IS NOT
NULL`` keeps the reverse-lookup cheap.

single-active-profile invariant
-------------------------------
At most one voice profile per user is ``is_active = true`` at any time.
This is enforced via a partial UNIQUE index on ``(user_id) WHERE
is_active = true`` — a single SQL invariant beats application-side
serialization (which races under concurrent calls). The
``/voice-profiles/[id]/activate`` route does a single-transaction flip
that respects the invariant.

style_rules / example_openings / style_adjectives
-------------------------------------------------
``style_rules`` is a JSONB array of imperative strings ("Use short
sentences", "Prefer concrete nouns"). ``example_openings`` is a JSONB
array of 3-5 short sample openings sampled verbatim from inputs.
``style_adjectives`` is a deduped TEXT[] union of single-word style
descriptors per sample analysis.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``, ``CREATE INDEX IF
NOT EXISTS``, ``CREATE UNIQUE INDEX IF NOT EXISTS``). Downgrade drops the
profiles table first (no dependents), then the samples table, then their
indexes.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0044_autobiographer_phase3"
down_revision: Union[str, None] = "0043_autobiographer_phase2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. agos_autobiographer_voice_samples ------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_voice_samples (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL,
    memory_id   UUID        NULL
                REFERENCES agos_autobiographer_memories(id) ON DELETE CASCADE,
    title       TEXT        NULL,
    body_text   TEXT        NOT NULL,
    word_count  INT         NOT NULL,
    is_archived BOOLEAN     NOT NULL DEFAULT false,
    metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_autobiographer_voice_samples_user_updated_idx
    ON agos_autobiographer_voice_samples (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agos_autobiographer_voice_samples_memory_idx
    ON agos_autobiographer_voice_samples (memory_id)
    WHERE memory_id IS NOT NULL;

COMMENT ON COLUMN agos_autobiographer_voice_samples.memory_id IS
  'Optional source memory. When set, the sample is "this memory sounds like me"; CASCADE on memory delete. When null, the sample is free-typed.';

COMMENT ON COLUMN agos_autobiographer_voice_samples.is_archived IS
  'Soft-archive flag. Archived samples are excluded from voice-profile builds but retained for the audit trail.';

COMMENT ON COLUMN agos_autobiographer_voice_samples.word_count IS
  'Whitespace-split word count of body_text, computed server-side on every write so the Voice Studio UI can display sample mass without re-scanning.';

-- 2. agos_autobiographer_voice_profiles -----------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_voice_profiles (
    id                UUID        PRIMARY KEY,
    user_id           UUID        NOT NULL,
    version           INT         NOT NULL,
    is_active         BOOLEAN     NOT NULL DEFAULT false,
    style_summary     TEXT        NOT NULL,
    style_adjectives  TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    style_rules       JSONB       NOT NULL DEFAULT '[]'::jsonb,
    example_openings  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    sample_count      INT         NOT NULL,
    sample_word_count INT         NOT NULL,
    built_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    builder           TEXT        NOT NULL DEFAULT 'coach',
    metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb
);

-- At most one active profile per user (Phase 7 reads "the active one").
CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_voice_profiles_active_uq
    ON agos_autobiographer_voice_profiles (user_id)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS agos_autobiographer_voice_profiles_user_version_idx
    ON agos_autobiographer_voice_profiles (user_id, version DESC);

COMMENT ON COLUMN agos_autobiographer_voice_profiles.style_summary IS
  '3-6 sentence prose description of the user voice. Phase 7 chapter_drafter renders this verbatim in the drafter system prompt.';

COMMENT ON COLUMN agos_autobiographer_voice_profiles.style_rules IS
  'JSONB array of imperative strings ("Use short sentences", "Prefer concrete nouns"). Phase 7 splices these into the drafter rule block.';

COMMENT ON COLUMN agos_autobiographer_voice_profiles.example_openings IS
  'JSONB array of 3-5 short sample openings drawn verbatim from inputs. Phase 7 selects 1-2 at generation time as few-shot anchors.';

COMMENT ON COLUMN agos_autobiographer_voice_profiles.builder IS
  'Attribution of who/what built this profile: a coach session id, "manual", or a model slug. Free-form to leave room for Phase 7 model swaps.';
"""


_DOWNGRADE_SQL = r"""
-- Drop profiles first (no dependents).
DROP INDEX IF EXISTS agos_autobiographer_voice_profiles_user_version_idx;
DROP INDEX IF EXISTS agos_autobiographer_voice_profiles_active_uq;
DROP TABLE IF EXISTS agos_autobiographer_voice_profiles;

-- Then samples.
DROP INDEX IF EXISTS agos_autobiographer_voice_samples_memory_idx;
DROP INDEX IF EXISTS agos_autobiographer_voice_samples_user_updated_idx;
DROP TABLE IF EXISTS agos_autobiographer_voice_samples;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
