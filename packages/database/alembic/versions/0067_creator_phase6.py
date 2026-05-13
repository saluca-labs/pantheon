"""Creator OS Phase 6 — AI Chat.

Revision ID: 0067_creator_phase6
Revises: 0066_creator_phase5
Create Date: 2026-05-13

Phase 6 introduces multi-model AI chat with conversation history stored as
inline JSONB messages on the session row. Supports Anthropic (Claude),
OpenAI (GPT), and Ollama (local) backends.

Schema delta
------------

1. ``agos_creator_conversations`` (NEW — AI chat conversations)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id TEXT NOT NULL`` (no FK — cross-OS contract)
     - ``title TEXT NOT NULL DEFAULT 'New Conversation'``
     - ``model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6'``
     - ``system_prompt TEXT``
     - ``messages JSONB NOT NULL DEFAULT '[]'::jsonb``
     - ``created_at``, ``updated_at``

Indexes
-------
- ``idx_creator_convos_user`` on (user_id, updated_at DESC) for list feeds.

Locked design decisions
-----------------------
- **No FK on user_id.** Ownership enforced at BFF route layer.
- **Single-table inline messages.** No separate messages table; the full
  transcript lives as a JSONB array on the conversation row. Matches the
  Maker/Autobiographer coach patterns.
- **Multi-provider routing.** The ``model`` column stores a provider-aware
  key (e.g. ``claude-sonnet-4-6``, ``gpt-4o``, ``ollama/deepseek-v3.2:cloud``).
  The streaming endpoint routes to the correct API based on prefix detection.

Idempotency
-----------
CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DO $$ guard on
trigger. Safe to re-run on a partially-applied database.

Bind-marker safety
------------------
SQLAlchemy's ``text()`` parses ``:word`` patterns as bind markers. This
module uses ``op.execute`` with raw string constants (NOT
``op.execute(text(...))``); the SQL bodies carry zero ``:<word>`` patterns.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0067_creator_phase6"
down_revision: Union[str, None] = "0066_creator_phase5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ agos_creator_conversations (NEW) ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_creator_conversations (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       TEXT         NOT NULL,
    title         TEXT         NOT NULL DEFAULT 'New Conversation',
    model         TEXT         NOT NULL DEFAULT 'claude-sonnet-4-6',
    system_prompt TEXT         NULL,
    messages      JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE agos_creator_conversations IS
  'Creator OS AI Chat. Multi-model streaming conversations with inline JSONB messages. Supports Anthropic, OpenAI, and Ollama backends.';

COMMENT ON COLUMN agos_creator_conversations.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_creator_conversations.title IS
  'Conversation title. Defaults to ''New Conversation''; auto-titled from the first user message.';

COMMENT ON COLUMN agos_creator_conversations.model IS
  'Model identifier. Provider-aware key (e.g. claude-sonnet-4-6, gpt-4o, ollama/deepseek-v3.2:cloud). The streaming endpoint routes to the correct API based on prefix detection.';

COMMENT ON COLUMN agos_creator_conversations.system_prompt IS
  'Optional system prompt set by the user scoped to this conversation.';

COMMENT ON COLUMN agos_creator_conversations.messages IS
  'Ordered JSONB array of {role, content} objects forming the full transcript.';

-- ─── Indexes ──────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_creator_convos_user
    ON agos_creator_conversations (user_id, updated_at DESC);

-- ─── updated_at trigger ───────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_creator_convos_updated_at'
    ) THEN
        CREATE TRIGGER trg_creator_convos_updated_at
            BEFORE UPDATE ON agos_creator_conversations
            FOR EACH ROW
            EXECUTE FUNCTION agos_touch_updated_at();
    END IF;
END$$;
"""


_DOWNGRADE_SQL = r"""
DROP TRIGGER IF EXISTS trg_creator_convos_updated_at ON agos_creator_conversations;
DROP TABLE IF EXISTS agos_creator_conversations;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
