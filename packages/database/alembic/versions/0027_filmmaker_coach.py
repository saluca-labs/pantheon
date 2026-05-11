"""Filmmaker OS Phase 7 — AI coach (conversations + messages + action log).

Revision ID: 0027_filmmaker_coach
Revises: 0026_filmmaker_storyboard
Create Date: 2026-05-10

Phase 7 closes Filmmaker OS with a streaming, tool-using development-exec /
script-reader / dialogue-doctor / scheduler / general AI coach:

- ``agos_filmmaker_coach_conversation`` — one chat session per row, scoped
  to a single filmmaker project (CASCADE on project delete).
- ``agos_filmmaker_coach_message``      — per-turn messages (user / assistant /
  system / tool).
- ``agos_filmmaker_coach_action_log``   — audit of every tool-call effect,
  denormalized with project_id + user_id for fast per-project / per-user
  pulls.

Filmmaker is a low-harm domain, so unlike the Health coach there is no
crisis-detection column on the message table. The coach defers production-
business / legal questions to specific guilds/attorneys, never invents
project facts, and never prescribes legal or contractual advice.

Idempotency: all DDL is ``IF NOT EXISTS``.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0027_filmmaker_coach"
down_revision: Union[str, None] = "0026_filmmaker_storyboard"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- Conversations -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_filmmaker_coach_conversation (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id             UUID NOT NULL REFERENCES agos_filmmaker_projects(id) ON DELETE CASCADE,
    mode                   TEXT NOT NULL DEFAULT 'general',
    title                  TEXT,
    model                  TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    system_prompt_version  TEXT NOT NULL DEFAULT 'v1',
    metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_filmmaker_coach_conversation_mode_enum
        CHECK (mode IN ('development_exec', 'script_reader', 'dialogue_doctor', 'scheduler', 'general'))
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_coach_conversation_project_updated_idx
    ON agos_filmmaker_coach_conversation (project_id, updated_at DESC);

-- Messages ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_filmmaker_coach_message (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES agos_filmmaker_coach_conversation(id) ON DELETE CASCADE,
    role             TEXT NOT NULL,
    content          TEXT NOT NULL,
    tool_calls       JSONB,
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_filmmaker_coach_message_role_enum
        CHECK (role IN ('user', 'assistant', 'system', 'tool'))
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_coach_message_conv_time_idx
    ON agos_filmmaker_coach_message (conversation_id, created_at);

-- Action log (tool-call audit trail) --------------------------------------
CREATE TABLE IF NOT EXISTS agos_filmmaker_coach_action_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES agos_filmmaker_coach_conversation(id) ON DELETE CASCADE,
    message_id       UUID REFERENCES agos_filmmaker_coach_message(id) ON DELETE SET NULL,
    project_id       UUID NOT NULL REFERENCES agos_filmmaker_projects(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL,
    tool_name        TEXT NOT NULL,
    tool_input       JSONB NOT NULL,
    tool_output      JSONB NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_coach_action_log_user_time_idx
    ON agos_filmmaker_coach_action_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agos_filmmaker_coach_action_log_project_time_idx
    ON agos_filmmaker_coach_action_log (project_id, created_at DESC);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_filmmaker_coach_action_log_project_time_idx;
DROP INDEX IF EXISTS agos_filmmaker_coach_action_log_user_time_idx;
DROP TABLE IF EXISTS agos_filmmaker_coach_action_log;

DROP INDEX IF EXISTS agos_filmmaker_coach_message_conv_time_idx;
DROP TABLE IF EXISTS agos_filmmaker_coach_message;

DROP INDEX IF EXISTS agos_filmmaker_coach_conversation_project_updated_idx;
DROP TABLE IF EXISTS agos_filmmaker_coach_conversation;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
