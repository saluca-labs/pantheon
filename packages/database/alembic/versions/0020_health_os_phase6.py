"""Health OS Phase 6 — LLM coach + conversation + action log.

Revision ID: 0020_health_os_phase6
Revises: 0019_health_os_phase5c
Create Date: 2026-05-10

Phase 6 closes Health OS with a streaming, tool-using mental-health coach:

- ``agos_mh_coach_conversation``  — one chat session per row.
- ``agos_mh_coach_message``       — per-turn messages (user/assistant/system/tool).
- ``agos_mh_coach_action_log``    — audit of every tool-call effect.

The coach never offers a diagnosis, never prescribes medication, and always
defers acute crisis to the existing crisis-guard + 988 referral system. The
``crisis_detected`` flag on a message is set by the post-stream filter when
crisis language is observed in either the user input or the assistant reply.

Idempotency: all DDL is ``IF NOT EXISTS``.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0020_health_os_phase6"
down_revision: Union[str, None] = "0019_health_os_phase5c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- Conversations -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_mh_coach_conversation (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              UUID NOT NULL,
    user_id                UUID NOT NULL,
    title                  TEXT,
    model                  TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    system_prompt_version  TEXT NOT NULL DEFAULT 'v1',
    metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_mh_coach_conversation_user_updated_idx
    ON agos_mh_coach_conversation (tenant_id, user_id, updated_at DESC);

-- Messages ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_mh_coach_message (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES agos_mh_coach_conversation(id) ON DELETE CASCADE,
    role             TEXT NOT NULL,
    content          TEXT NOT NULL,
    tool_calls       JSONB,
    crisis_detected  BOOLEAN NOT NULL DEFAULT false,
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_coach_message_role_enum
        CHECK (role IN ('user', 'assistant', 'system', 'tool'))
);

CREATE INDEX IF NOT EXISTS agos_mh_coach_message_conv_time_idx
    ON agos_mh_coach_message (conversation_id, created_at);

-- Action log (tool-call audit trail) --------------------------------------
CREATE TABLE IF NOT EXISTS agos_mh_coach_action_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES agos_mh_coach_conversation(id) ON DELETE CASCADE,
    message_id       UUID REFERENCES agos_mh_coach_message(id) ON DELETE SET NULL,
    tenant_id        UUID NOT NULL,
    user_id          UUID NOT NULL,
    tool_name        TEXT NOT NULL,
    tool_input       JSONB NOT NULL,
    tool_output      JSONB NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_mh_coach_action_log_user_time_idx
    ON agos_mh_coach_action_log (tenant_id, user_id, created_at DESC);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_mh_coach_action_log_user_time_idx;
DROP TABLE IF EXISTS agos_mh_coach_action_log;

DROP INDEX IF EXISTS agos_mh_coach_message_conv_time_idx;
DROP TABLE IF EXISTS agos_mh_coach_message;

DROP INDEX IF EXISTS agos_mh_coach_conversation_user_updated_idx;
DROP TABLE IF EXISTS agos_mh_coach_conversation;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
