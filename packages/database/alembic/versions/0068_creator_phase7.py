"""Creator OS Phase 7 — AI Content Coach.

Revision ID: 0068_creator_phase7
Revises: 0067_creator_phase6
Create Date: 2026-05-13

Phase 7 introduces the AI Content Coach — a five-mode conversational advisor
tailored for content creators. Modes cover editorial strategy, writing craft,
audience growth, monetization, and general creator guidance.

Schema delta
------------

1. ``agos_creator_coach_sessions`` (NEW — coach session persistence)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id TEXT NOT NULL`` (no FK — cross-OS contract)
     - ``title TEXT NOT NULL DEFAULT 'New session'``
     - ``mode TEXT NOT NULL`` CHECK 5 canonical modes:
       content_strategist, writing_coach, audience_builder,
       monetization_advisor, general
     - ``model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6'``
     - ``messages JSONB NOT NULL DEFAULT '[]'``
     - ``archived_at TIMESTAMPTZ``
     - ``created_at``, ``updated_at``

Indexes
-------
- ``idx_creator_coach_user`` on (user_id, updated_at DESC)
  for the session list feed.
- ``idx_creator_coach_user_active`` partial on
  (user_id, updated_at DESC) WHERE archived_at IS NULL
  for the active-session sidebar.
- ``idx_creator_coach_mode`` partial on
  (user_id, mode) WHERE archived_at IS NULL
  for per-mode session filtering.

Locked design decisions
-----------------------
- **No FK on user_id.** Ownership enforced at BFF route layer.
- **user_id is TEXT**, not UUID — matches all other creator tables.
- **Single-table transcript.** Messages stored as a JSONB array on the
  session row; no separate messages table. Matches Business coach pattern.
- **Archive via soft-delete.** ``archived_at`` column + partial indexes;
  no hard-delete for recent sessions.
- **Mode is a CHECK constraint**, shared with the modes.ts taxonomy.
- **No domain output filter.** Creator coach has no secret-redaction needs.

Idempotency
-----------
CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS (for standard indexes),
and DO $$ guard on pg_indexes (for partial indexes). Safe to re-run.

Bind-marker safety
------------------
This module uses ``op.execute`` with raw string constants (NOT
``op.execute(text(...))``); the SQL bodies carry zero ``:<word>`` patterns.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0068_creator_phase7"
down_revision: Union[str, None] = "0067_creator_phase6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ agos_creator_coach_sessions (NEW) ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_creator_coach_sessions (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT         NOT NULL,
    title       TEXT         NOT NULL DEFAULT 'New session',
    mode        TEXT         NOT NULL,
    model       TEXT         NOT NULL DEFAULT 'claude-sonnet-4-6',
    messages    JSONB        NOT NULL DEFAULT '[]'::jsonb,
    archived_at TIMESTAMPTZ  NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_creator_coach_sessions_mode_check
        CHECK (mode IN ('content_strategist', 'writing_coach', 'audience_builder',
                        'monetization_advisor', 'general'))
);

COMMENT ON TABLE agos_creator_coach_sessions IS
  'AI Content Coach session persistence. Each row stores the full transcript as an ordered JSONB array. Supports soft-delete via archived_at.';

COMMENT ON COLUMN agos_creator_coach_sessions.user_id IS
  'Owning user (TEXT). No FK — ownership is enforced at the BFF route layer per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_creator_coach_sessions.mode IS
  'Coach mode. CHECK-constrained: content_strategist, writing_coach, audience_builder, monetization_advisor, general. Shared with modes.ts taxonomy.';

COMMENT ON COLUMN agos_creator_coach_sessions.model IS
  'Anthropic model id used for this session. Defaults to claude-sonnet-4-6.';

COMMENT ON COLUMN agos_creator_coach_sessions.messages IS
  'Ordered transcript as a JSONB array of {role, content, created_at} objects. Appended atomically via messages || $new::jsonb.';

COMMENT ON COLUMN agos_creator_coach_sessions.archived_at IS
  'Soft-delete timestamp. NULL = active session. Partial indexes exclude archived rows for list feeds.';

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Session list: user's sessions sorted by recent activity
CREATE INDEX IF NOT EXISTS idx_creator_coach_user
    ON agos_creator_coach_sessions (user_id, updated_at DESC);

-- Active session sidebar: only non-archived sessions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'idx_creator_coach_user_active'
    ) THEN
        CREATE INDEX idx_creator_coach_user_active
            ON agos_creator_coach_sessions (user_id, updated_at DESC)
            WHERE archived_at IS NULL;
    END IF;
END$$;

-- Per-mode session filter (active only)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'idx_creator_coach_mode'
    ) THEN
        CREATE INDEX idx_creator_coach_mode
            ON agos_creator_coach_sessions (user_id, mode)
            WHERE archived_at IS NULL;
    END IF;
END$$;

-- ─── updated_at trigger ───────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_creator_coach_sessions_updated_at'
    ) THEN
        CREATE TRIGGER trg_creator_coach_sessions_updated_at
            BEFORE UPDATE ON agos_creator_coach_sessions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END$$;
"""


_DOWNGRADE_SQL = r"""
DROP TABLE IF EXISTS agos_creator_coach_sessions;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
