"""Autobiographer OS Phase 7 — AI coach (sessions table + FK rebind).

Revision ID: 0048_autobiographer_phase7
Revises: 0047_autobiographer_phase6
Create Date: 2026-05-12

Phase 7 closes Autobiographer OS with a streaming Anthropic-backed AI
coach. Four modes are surfaced to the user — ``interviewer``,
``chapter_drafter``, ``narrative_critic``, and ``general`` — and
persisted as chat sessions. Mirrors Maker OS Phase 7 exactly: one table
that bundles the conversation row with the messages array (JSONB) on
the row itself, rather than the two-table conversation+message split
used by Filmmaker / Cyber.

Schema
------
1. ``agos_autobiographer_coach_sessions`` — new table.

   Columns::

       id          UUID PK
       user_id     UUID NOT NULL                -- owner; not enforced as FK
                                                -- here (auth user table lives
                                                -- outside of agos_autobiographer_*).
       book_id     UUID NULL                    -- per-OS book UUID, NO FK
                                                -- by design (v0.1.30 platform
                                                -- contract). NULL = workshop-scoped.
       mode        TEXT NOT NULL
                     CHECK in (interviewer, chapter_drafter,
                               narrative_critic, general)
       title       TEXT NOT NULL
       messages    JSONB NOT NULL DEFAULT '[]'  -- ordered { role, content,
                                                -- created_at } array
       metadata    JSONB NOT NULL DEFAULT '{}'  -- carries system_prompt_version,
                                                -- source_memory_ids, voice_profile_id
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
       updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()

   Indexes:

   * ``(user_id, updated_at DESC)`` — recent sessions list.
   * partial ``(book_id, updated_at DESC) WHERE book_id IS NOT NULL`` —
     per-book session list (book-detail page Coach tab).
   * ``(user_id, mode, updated_at DESC)`` — mode-filtered recent list.

2. FK rebind on ``agos_autobiographer_chapter_revisions.coach_session_id``.

   Phase 4 (migration 0045) added ``coach_session_id UUID NULL`` with NO
   FK because the target table didn't exist yet. With Phase 7 the target
   table is now present, so we wire the FK. ``ON DELETE SET NULL`` so
   deleting a coach session does NOT cascade-delete chapter revisions
   the user has already committed — those revisions become free-standing
   (no coach attribution) but remain in the manuscript.

book_id is intentionally FK-less
--------------------------------
The same v0.1.30 per-OS UUID contract that governs ``agos_audit.project_id``
applies to per-OS ``project_id`` / ``book_id`` columns on cross-cutting
tables: the column carries a UUID for filter / index use, but enforcing
referential integrity against the per-OS book table would couple this
table to a specific OS schema. The owning row stays internally
consistent via ``user_id`` filtering.

coach_session_id FK ON DELETE SET NULL
--------------------------------------
A chapter revision is a durable artifact; once the user accepts it,
deleting the originating coach session must not delete the revision.
SET NULL retains the revision text and citations and simply forgets
which conversation originated it.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``, ``CREATE INDEX
IF NOT EXISTS``). The FK rebind uses ``ALTER TABLE … ADD CONSTRAINT IF
NOT EXISTS`` (Postgres 9.6+) so a re-run is a no-op.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0048_autobiographer_phase7"
down_revision: Union[str, None] = "0047_autobiographer_phase6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- agos_autobiographer_coach_sessions — chat session rows + inline messages.
--
-- One row per session. The `messages` JSONB column stores the full chat
-- transcript as an ordered array of { role, content, created_at }
-- objects. This is the Phase 7 simpler shape spec'd in autobiographer.md
-- mirroring Maker — the Filmmaker / Cyber coaches split conversations
-- and messages into two tables because they additionally persist
-- tool-call action logs. Autobiographer ships no mutating tools (the
-- coach is advisory + draft-only), so the simpler one-table shape
-- suffices.
--
-- book_id is nullable: NULL = workshop-scoped chat that ranges across
-- the user's entire autobiographer domain; non-NULL = scoped to one
-- book for which the system prompt loads richer context.

CREATE TABLE IF NOT EXISTS agos_autobiographer_coach_sessions (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL,
    book_id     UUID        NULL,
    mode        TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    messages    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_autobiographer_coach_sessions_mode_chk
        CHECK (mode IN ('interviewer', 'chapter_drafter', 'narrative_critic', 'general'))
);

-- Recent-sessions list (default surface on the coach hub).
CREATE INDEX IF NOT EXISTS agos_autobiographer_coach_sessions_user_updated_idx
    ON agos_autobiographer_coach_sessions (user_id, updated_at DESC);

-- Per-book session list. Partial index so it only carries rows scoped
-- to a book — workshop-wide sessions skip this index entirely.
CREATE INDEX IF NOT EXISTS agos_autobiographer_coach_sessions_book_updated_idx
    ON agos_autobiographer_coach_sessions (book_id, updated_at DESC)
    WHERE book_id IS NOT NULL;

-- Mode-filtered recent list (used by the hub mode filter chips).
CREATE INDEX IF NOT EXISTS agos_autobiographer_coach_sessions_user_mode_updated_idx
    ON agos_autobiographer_coach_sessions (user_id, mode, updated_at DESC);

COMMENT ON COLUMN agos_autobiographer_coach_sessions.user_id IS
  'Owner of the session. Not enforced as FK here — the auth user table lives outside agos_autobiographer_* per the per-OS pattern.';

COMMENT ON COLUMN agos_autobiographer_coach_sessions.book_id IS
  'Per-OS book UUID; NOT a FK by design. Matches the v0.1.30 platform contract where cross-cutting per-OS columns carry per-OS UUIDs without referential integrity to a single project table. NULL = workshop-scoped chat.';

COMMENT ON COLUMN agos_autobiographer_coach_sessions.mode IS
  'Phase 7 mode taxonomy. CHECK in (interviewer, chapter_drafter, narrative_critic, general). The 4 modes drive context loading and the per-mode system prompt.';

COMMENT ON COLUMN agos_autobiographer_coach_sessions.messages IS
  'Ordered transcript as a JSONB array of { role, content, created_at } objects. role in (user, assistant, system). Append-only at the application layer.';

COMMENT ON COLUMN agos_autobiographer_coach_sessions.metadata IS
  'Carries system_prompt_version, source_memory_ids (for chapter_drafter sessions), voice_profile_id, and any other per-session bookkeeping the route layer needs to persist alongside the transcript.';

COMMENT ON COLUMN agos_autobiographer_coach_sessions.title IS
  'Auto-summarized from the first user turn (truncated to 60 chars) on session create, or set explicitly via PATCH. Never NULL post-create.';

-- FK rebind: chapter_revisions.coach_session_id → coach_sessions(id).
--
-- Phase 4 added the column without a FK because the target table did
-- not yet exist (chicken-and-egg). Now that coach_sessions is present,
-- we wire the FK with ON DELETE SET NULL — deleting a coach session
-- must not cascade to chapter revisions the user has already saved.
--
-- DO block guards the add: Postgres has no ADD CONSTRAINT IF NOT
-- EXISTS, so we look up pg_constraint by name and skip if present.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'agos_autobiographer_chapter_revisions_coach_session_fk'
    ) THEN
        ALTER TABLE agos_autobiographer_chapter_revisions
            ADD CONSTRAINT agos_autobiographer_chapter_revisions_coach_session_fk
            FOREIGN KEY (coach_session_id)
            REFERENCES agos_autobiographer_coach_sessions(id)
            ON DELETE SET NULL;
    END IF;
END $$;
"""


_DOWNGRADE_SQL = r"""
-- Drop FK rebind first (chapter_revisions.coach_session_id stays as a
-- nullable UUID with no FK — same shape as post-Phase-4 baseline).
ALTER TABLE agos_autobiographer_chapter_revisions
    DROP CONSTRAINT IF EXISTS agos_autobiographer_chapter_revisions_coach_session_fk;

-- Reverse-create order: drop indexes first, then the table.

DROP INDEX IF EXISTS agos_autobiographer_coach_sessions_user_mode_updated_idx;
DROP INDEX IF EXISTS agos_autobiographer_coach_sessions_book_updated_idx;
DROP INDEX IF EXISTS agos_autobiographer_coach_sessions_user_updated_idx;

DROP TABLE IF EXISTS agos_autobiographer_coach_sessions;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
