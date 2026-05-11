"""Maker OS Phase 7 — AI coach (sessions table).

Revision ID: 0040_maker_phase7
Revises: 0039_maker_phase6
Create Date: 2026-05-11

Phase 7 closes Maker OS with a streaming Anthropic-backed AI coach. Four
modes are surfaced to the user — `procurement_advisor`, `build_planner`,
`shop_safety`, and `general` — and persisted as chat sessions. Following
the locked Phase 7 spec, the schema is *one* table that bundles the
conversation row with the messages array (JSONB) on the row itself, rather
than the two-table conversation+message split used by Filmmaker / Cyber.

The Maker coach is project-OR-workshop-scoped: a session may carry a
`project_id` (per-OS UUID, NOT a FK by design — matches the v0.1.30
platform contract for cross-cutting per-OS columns), or it may be null
for a workshop-wide chat that ranges across the user's whole maker
domain.

Coach safety policy: no domain-output filter (matches Filmmaker, not
Cyber). The shop-safety nudge is enforced via the system prompt only —
no content classifier, no PII redaction, no token sniffing. The Maker
domain isn't credential-sensitive like Cyber and isn't compliance-bound
like Health; users explicitly opt in by typing.

New table
---------
``agos_maker_coach_sessions``

Columns::

    id          UUID PK
    user_id     UUID NOT NULL                -- owner; FK CASCADE'd to platform users
                                             -- not enforced as FK here (matches the
                                             -- per-OS pattern — auth-tier user table
                                             -- lives outside of agos_maker_*).
    project_id  UUID NULL                    -- per-OS project UUID, no FK by design.
                                             -- Nullable: NULL = workshop-scoped chat.
    mode        TEXT NOT NULL
                  CHECK in (procurement_advisor, build_planner,
                            shop_safety, general)
    title       TEXT NOT NULL                -- auto-summarized from first turn or
                                             -- user-set. Never NULL post-create.
    messages    JSONB NOT NULL DEFAULT '[]'  -- ordered array of
                                             -- { role, content, created_at }
    metadata    JSONB NOT NULL DEFAULT '{}'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()

Indexes:

  * ``(user_id, updated_at DESC)`` — recent sessions list (default surface).
  * partial ``(project_id, updated_at DESC) WHERE project_id IS NOT NULL`` —
    per-project session list on the project Coach tab.
  * ``(user_id, mode, updated_at DESC)`` — mode-filtered list.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``, ``CREATE INDEX IF
NOT EXISTS``, with the CHECK constraint inlined on table create so the
table cannot exist without it). The downgrade is reversible: drop the
indexes in reverse-create order, then drop the table.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0040_maker_phase7"
down_revision: Union[str, None] = "0039_maker_phase6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- agos_maker_coach_sessions — chat session rows + inline messages array.
--
-- One row per session. The `messages` JSONB column stores the full chat
-- transcript as an ordered array of { role, content, created_at }
-- objects. This is the simpler Phase 7 shape spec'd in maker.md — the
-- Filmmaker / Cyber coaches split conversations and messages into two
-- tables because they additionally persist tool-call action logs. Maker
-- ships no mutating tools (the coach is advisory only), so the simpler
-- one-table shape suffices.
--
-- project_id is nullable: NULL = workshop-scoped chat that ranges across
-- the user's entire maker domain; non-NULL = scoped to one project for
-- which the system prompt loads richer context.

CREATE TABLE IF NOT EXISTS agos_maker_coach_sessions (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL,
    project_id  UUID        NULL,
    mode        TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    messages    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_maker_coach_sessions_mode_chk
        CHECK (mode IN ('procurement_advisor', 'build_planner', 'shop_safety', 'general'))
);

-- Recent-sessions list (default surface on the coach hub).
CREATE INDEX IF NOT EXISTS agos_maker_coach_sessions_user_updated_idx
    ON agos_maker_coach_sessions (user_id, updated_at DESC);

-- Per-project session list (project Coach tab). Partial index so it
-- only carries rows scoped to a project — workshop-wide sessions skip
-- this index entirely.
CREATE INDEX IF NOT EXISTS agos_maker_coach_sessions_project_updated_idx
    ON agos_maker_coach_sessions (project_id, updated_at DESC)
    WHERE project_id IS NOT NULL;

-- Mode-filtered recent list (used by the hub mode filter chips).
CREATE INDEX IF NOT EXISTS agos_maker_coach_sessions_user_mode_updated_idx
    ON agos_maker_coach_sessions (user_id, mode, updated_at DESC);

COMMENT ON COLUMN agos_maker_coach_sessions.user_id IS
  'Owner of the session. Not enforced as FK here — the auth user table lives outside agos_maker_* per the per-OS pattern.';

COMMENT ON COLUMN agos_maker_coach_sessions.project_id IS
  'Per-OS project UUID; NOT a FK by design. Matches the v0.1.30 platform contract where cross-cutting per-OS columns carry per-OS UUIDs without referential integrity to a single project table. NULL = workshop-scoped chat.';

COMMENT ON COLUMN agos_maker_coach_sessions.mode IS
  'Phase 7 mode taxonomy. CHECK in (procurement_advisor, build_planner, shop_safety, general). The 4 modes drive context loading and the per-mode system prompt.';

COMMENT ON COLUMN agos_maker_coach_sessions.messages IS
  'Ordered transcript as a JSONB array of { role, content, created_at } objects. role in (user, assistant, system). Append-only at the application layer.';

COMMENT ON COLUMN agos_maker_coach_sessions.title IS
  'Auto-summarized from the first user turn (truncated to 60 chars) on session create, or set explicitly via PATCH. Never NULL post-create.';
"""


_DOWNGRADE_SQL = r"""
-- Reverse-create order: drop indexes first, then the table.

DROP INDEX IF EXISTS agos_maker_coach_sessions_user_mode_updated_idx;
DROP INDEX IF EXISTS agos_maker_coach_sessions_project_updated_idx;
DROP INDEX IF EXISTS agos_maker_coach_sessions_user_updated_idx;

DROP TABLE IF EXISTS agos_maker_coach_sessions;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
