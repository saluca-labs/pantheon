"""Research OS Phase 7 — AI coach (sessions table).

Revision ID: 0054_research_phase7
Revises: 0053_research_phase6
Create Date: 2026-05-12

Phase 7 closes the Research OS feature build with a streaming
Anthropic-backed AI coach. Four modes are surfaced to the user —
``lit_reviewer``, ``hypothesis_critic``, ``methods_advisor``, and
``general`` — and persisted as chat sessions. Mirrors Autobiographer
Phase 7 (migration 0048) and Maker Phase 7 exactly: ONE table that
bundles the conversation row with the messages array (JSONB) on the
row itself, rather than the two-table conversation+message split used
by Filmmaker / Cyber.

Unlike Autobiographer Phase 7, this migration adds NO foreign-key
rebind. Research does not have an analogous cross-table seam — there
is no `coach_session_id` column on any pre-existing Research table
that needs to be wired to the new sessions table. The coach is purely
advisory; commits flow through the existing notebook / hypothesis /
evidence routes if the user wants to persist a draft.

Schema
------
1. ``agos_research_coach_sessions`` — new table.

   Columns::

       id            UUID PK
       user_id       UUID NOT NULL                -- owner; not enforced as FK
                                                  -- here (auth user table lives
                                                  -- outside of agos_research_*).
       experiment_id UUID NULL                    -- per-OS experiment UUID, NO FK
                                                  -- by design (v0.1.30 platform
                                                  -- contract). NULL = workshop-scoped.
       mode          TEXT NOT NULL
                       CHECK in (lit_reviewer, hypothesis_critic,
                                 methods_advisor, general)
       title         TEXT NOT NULL
       messages      JSONB NOT NULL DEFAULT '[]'  -- ordered { role, content,
                                                  -- created_at } array
       metadata      JSONB NOT NULL DEFAULT '{}'  -- carries system_prompt_version
                                                  -- and mode-specific context anchors
       created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
       updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()

   Indexes:

   * ``(user_id, updated_at DESC)`` — recent sessions list.
   * partial ``(experiment_id, updated_at DESC) WHERE experiment_id IS NOT NULL`` —
     per-experiment session list (experiment-detail page Coach CTA target).
   * ``(user_id, mode, updated_at DESC)`` — mode-filtered recent list.

experiment_id is intentionally FK-less
--------------------------------------
The v0.1.30 per-OS UUID contract that governs ``agos_audit.project_id``
applies to per-OS ``project_id`` / ``experiment_id`` columns on
cross-cutting tables: the column carries a UUID for filter / index
use, but enforcing referential integrity against the per-OS experiment
table would couple this table to a specific OS schema. The owning row
stays internally consistent via ``user_id`` filtering, and the route
layer additionally verifies experiment ownership at create time so a
stale UUID can't be planted.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``, ``CREATE INDEX
IF NOT EXISTS``).

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0054_research_phase7"
down_revision: Union[str, None] = "0053_research_phase6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- agos_research_coach_sessions — chat session rows + inline messages.
--
-- One row per session. The `messages` JSONB column stores the full chat
-- transcript as an ordered array of { role, content, created_at }
-- objects. This is the Phase 7 simpler shape spec'd in research.md
-- mirroring Autobiographer / Maker — the Filmmaker / Cyber coaches
-- split conversations and messages into two tables because they
-- additionally persist tool-call action logs. Research ships no
-- mutating tools (the coach is advisory-only), so the simpler
-- one-table shape suffices.
--
-- experiment_id is nullable: NULL = workshop-scoped chat that ranges
-- across the user's entire research domain; non-NULL = scoped to one
-- experiment for which the system prompt loads richer context.

CREATE TABLE IF NOT EXISTS agos_research_coach_sessions (
    id            UUID        PRIMARY KEY,
    user_id       UUID        NOT NULL,
    experiment_id UUID        NULL,
    mode          TEXT        NOT NULL,
    title         TEXT        NOT NULL,
    messages      JSONB       NOT NULL DEFAULT '[]'::jsonb,
    metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_coach_sessions_mode_chk
        CHECK (mode IN ('lit_reviewer', 'hypothesis_critic', 'methods_advisor', 'general'))
);

-- Recent-sessions list (default surface on the coach hub).
CREATE INDEX IF NOT EXISTS agos_research_coach_sessions_user_updated_idx
    ON agos_research_coach_sessions (user_id, updated_at DESC);

-- Per-experiment session list. Partial index so it only carries rows
-- scoped to an experiment — workshop-wide sessions skip this index
-- entirely.
CREATE INDEX IF NOT EXISTS agos_research_coach_sessions_experiment_updated_idx
    ON agos_research_coach_sessions (experiment_id, updated_at DESC)
    WHERE experiment_id IS NOT NULL;

-- Mode-filtered recent list (used by the hub mode filter chips).
CREATE INDEX IF NOT EXISTS agos_research_coach_sessions_user_mode_updated_idx
    ON agos_research_coach_sessions (user_id, mode, updated_at DESC);

COMMENT ON COLUMN agos_research_coach_sessions.user_id IS
  'Owner of the session. Not enforced as FK here — the auth user table lives outside agos_research_* per the per-OS pattern.';

COMMENT ON COLUMN agos_research_coach_sessions.experiment_id IS
  'Per-OS experiment UUID; NOT a FK by design. Matches the v0.1.30 platform contract where cross-cutting per-OS columns carry per-OS UUIDs without referential integrity to a single project table. NULL = workshop-scoped chat.';

COMMENT ON COLUMN agos_research_coach_sessions.mode IS
  'Phase 7 mode taxonomy. CHECK in (lit_reviewer, hypothesis_critic, methods_advisor, general). The 4 modes drive context loading and the per-mode system prompt. methods_advisor REQUIRES a non-null experiment_id at the route layer.';

COMMENT ON COLUMN agos_research_coach_sessions.messages IS
  'Ordered transcript as a JSONB array of { role, content, created_at } objects. role in (user, assistant, system). Append-only at the application layer.';

COMMENT ON COLUMN agos_research_coach_sessions.metadata IS
  'Carries system_prompt_version and mode-specific context anchors (e.g. experiment_ids_in_context, paper_ids_in_context) that the route layer persists alongside the transcript.';

COMMENT ON COLUMN agos_research_coach_sessions.title IS
  'Auto-summarized from the first user turn (truncated to 60 chars) on session create, or set explicitly via PATCH. Never NULL post-create.';
"""


_DOWNGRADE_SQL = r"""
-- Reverse-create order: drop indexes first, then the table.

DROP INDEX IF EXISTS agos_research_coach_sessions_user_mode_updated_idx;
DROP INDEX IF EXISTS agos_research_coach_sessions_experiment_updated_idx;
DROP INDEX IF EXISTS agos_research_coach_sessions_user_updated_idx;

DROP TABLE IF EXISTS agos_research_coach_sessions;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
