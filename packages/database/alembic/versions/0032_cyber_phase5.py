"""Cyber OS Phase 5 — AI coach (conversations + messages + action log).

Revision ID: 0032_cyber_phase5
Revises: 0031_cyber_phase4
Create Date: 2026-05-10

Phase 5 closes CyberSec OS with a streaming, tool-using SOC copilot:

- ``agos_cyber_coach_conversation`` — one chat session per row, scoped to the
  owning user (cyber is user-scoped, not tenant-scoped), optionally attached
  to a case for context.
- ``agos_cyber_coach_message``      — per-turn messages (user / assistant /
  system / tool). Each row carries ``redacted`` + ``redaction_matches`` so
  the secret-redaction-filter audit trail lives next to the chat content.
- ``agos_cyber_coach_action_log``   — audit of every tool-call effect,
  denormalized with owner_id + (nullable) case_id for fast per-user /
  per-case pulls.

Cyber is a low-harm advisory domain (the coach reads alerts/cases/IOCs, never
runs attack commands), so instead of Health's crisis-stream-filter we ship a
SECRET-REDACTION filter on the output stream — patterns for AWS / RSA / JWT /
GitHub / Anthropic / OpenAI / Slack secrets. Matches are replaced inline with
``[REDACTED:<type>]`` and recorded on the message row.

Idempotency: all DDL is ``IF NOT EXISTS``.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0032_cyber_phase5"
down_revision: Union[str, None] = "0031_cyber_phase4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- Conversations -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_cyber_coach_conversation (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id               UUID NOT NULL,
    case_id                UUID REFERENCES agos_cyber_cases(id) ON DELETE SET NULL,
    mode                   TEXT NOT NULL DEFAULT 'general',
    title                  TEXT,
    model                  TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    system_prompt_version  TEXT NOT NULL DEFAULT 'v1',
    metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_coach_conversation_mode_enum
        CHECK (mode IN ('triage_analyst', 'threat_hunter', 'responder', 'detection_engineer', 'general'))
);

CREATE INDEX IF NOT EXISTS agos_cyber_coach_conversation_owner_updated_idx
    ON agos_cyber_coach_conversation (owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agos_cyber_coach_conversation_case_idx
    ON agos_cyber_coach_conversation (case_id)
    WHERE case_id IS NOT NULL;

-- Messages ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_cyber_coach_message (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id    UUID NOT NULL REFERENCES agos_cyber_coach_conversation(id) ON DELETE CASCADE,
    role               TEXT NOT NULL,
    content            TEXT NOT NULL,
    tool_calls         JSONB,
    redacted           BOOLEAN NOT NULL DEFAULT false,
    redaction_matches  JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_coach_message_role_enum
        CHECK (role IN ('user', 'assistant', 'system', 'tool'))
);

CREATE INDEX IF NOT EXISTS agos_cyber_coach_message_conv_time_idx
    ON agos_cyber_coach_message (conversation_id, created_at);

-- Action log (tool-call audit trail) --------------------------------------
CREATE TABLE IF NOT EXISTS agos_cyber_coach_action_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES agos_cyber_coach_conversation(id) ON DELETE CASCADE,
    message_id       UUID REFERENCES agos_cyber_coach_message(id) ON DELETE SET NULL,
    owner_id         UUID NOT NULL,
    case_id          UUID,
    tool_name        TEXT NOT NULL,
    tool_input       JSONB NOT NULL,
    tool_output      JSONB NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_cyber_coach_action_log_owner_time_idx
    ON agos_cyber_coach_action_log (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agos_cyber_coach_action_log_case_time_idx
    ON agos_cyber_coach_action_log (case_id, created_at DESC)
    WHERE case_id IS NOT NULL;
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_cyber_coach_action_log_case_time_idx;
DROP INDEX IF EXISTS agos_cyber_coach_action_log_owner_time_idx;
DROP TABLE IF EXISTS agos_cyber_coach_action_log;

DROP INDEX IF EXISTS agos_cyber_coach_message_conv_time_idx;
DROP TABLE IF EXISTS agos_cyber_coach_message;

DROP INDEX IF EXISTS agos_cyber_coach_conversation_case_idx;
DROP INDEX IF EXISTS agos_cyber_coach_conversation_owner_updated_idx;
DROP TABLE IF EXISTS agos_cyber_coach_conversation;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
