"""Business OS Phase 7 — AI Coach.

Revision ID: 0061_business_phase7
Revises: 0060_business_phase6
Create Date: 2026-05-12

Phase 7 introduces the AI Coach — a five-mode conversational advisor that reads
the user's deals, invoices, expenses, projects, time entries, contacts, and
interactions to provide contextual guidance. Sessions store their full transcript
as an ordered JSONB array on the session row.

Schema delta
------------

1. ``agos_business_coach_sessions`` (NEW — coach session persistence)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id UUID NOT NULL`` (no FK — cross-OS contract)
     - ``project_id UUID`` nullable (per-OS UUID, no FK)
     - ``deal_id UUID`` nullable (per-OS UUID, no FK)
     - ``mode TEXT NOT NULL`` CHECK 5 canonical modes:
       pricing_advisor, sales_coach, marketing_advisor, business_strategist, general
     - ``title TEXT NOT NULL``
     - ``messages JSONB NOT NULL DEFAULT '[]'``
     - ``metadata JSONB NOT NULL DEFAULT '{}'``
     - ``created_at``, ``updated_at``

Indexes
-------
- ``agos_business_coach_sessions_user_updated_idx`` on (user_id, updated_at DESC)
  for the session sidebar feed.
- ``agos_business_coach_sessions_project_updated_partial_idx`` partial on
  (project_id, updated_at DESC) WHERE project_id IS NOT NULL for project-
  scoped session lookups.
- ``agos_business_coach_sessions_user_mode_updated_idx`` on
  (user_id, mode, updated_at DESC) for per-mode session filtering.

Locked design decisions
-----------------------
- **No FK on user_id.** Ownership enforced at BFF route layer.
- **project_id / deal_id have NO FK.** Per-OS UUID references; no cross-table
  integrity — the BFF resolves display names on read.
- **Single-table transcript.** Messages are stored as a JSONB array on the
  session row; no separate messages table. Matches Maker coach pattern.
- **No domain output filter.** Business coach has no secret-redaction filter
  (unlike Cyber coach).
- **Mode is a CHECK constraint**, shared with the modes.ts taxonomy so a typo
  surfaces as a type / test error everywhere.

Idempotency
-----------
CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS (for standard indexes),
and DO $$ guard on pg_indexes (for partial indexes). Safe to re-run on a
partially-applied database.

Bind-marker safety
------------------
Per prior-phase footgun: SQLAlchemy's ``text()`` parses ``:word`` patterns
as bind markers. This module uses ``op.execute`` with raw string constants
(NOT ``op.execute(text(...))``); the SQL bodies carry zero ``:<word>``
patterns.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0061_business_phase7"
down_revision: Union[str, None] = "0060_business_phase6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ agos_business_coach_sessions (NEW) ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_business_coach_sessions (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    project_id  UUID         NULL,
    deal_id     UUID         NULL,
    mode        TEXT         NOT NULL,
    title       TEXT         NOT NULL,
    messages    JSONB        NOT NULL DEFAULT '[]'::jsonb,
    metadata    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_coach_sessions_mode_check
        CHECK (mode IN ('pricing_advisor', 'sales_coach', 'marketing_advisor',
                        'business_strategist', 'general'))
);

COMMENT ON TABLE agos_business_coach_sessions IS
  'AI Coach session persistence. Each row stores the full transcript as an ordered JSONB array. Sessions are scoped to a user and optionally to a project and/or deal.';

COMMENT ON COLUMN agos_business_coach_sessions.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_business_coach_sessions.project_id IS
  'Optional project scope. No FK — projects are per-OS UUID references resolved at the BFF layer.';

COMMENT ON COLUMN agos_business_coach_sessions.deal_id IS
  'Optional deal scope. No FK — deals are per-OS UUID references resolved at the BFF layer.';

COMMENT ON COLUMN agos_business_coach_sessions.mode IS
  'Coach mode. CHECK-constrained: pricing_advisor, sales_coach, marketing_advisor, business_strategist, general. Shared with modes.ts taxonomy.';

COMMENT ON COLUMN agos_business_coach_sessions.messages IS
  'Ordered transcript as a JSONB array of {role, content, created_at} objects. Appended to atomically via messages || $new::jsonb.';

COMMENT ON COLUMN agos_business_coach_sessions.metadata IS
  'Free-form JSONB metadata. Reserved for future coach features (e.g. context snapshot hashes, model versions).';

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Sidebar feed: user's sessions sorted by recent activity
CREATE INDEX IF NOT EXISTS agos_business_coach_sessions_user_updated_idx
    ON agos_business_coach_sessions (user_id, updated_at DESC);

-- Project-scoped session lookups (only for sessions with a project)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_coach_sessions_project_updated_partial_idx'
    ) THEN
        CREATE INDEX agos_business_coach_sessions_project_updated_partial_idx
            ON agos_business_coach_sessions (project_id, updated_at DESC)
            WHERE project_id IS NOT NULL;
    END IF;
END$$;

-- Per-mode session filter (e.g. "show all pricing-advisor sessions")
CREATE INDEX IF NOT EXISTS agos_business_coach_sessions_user_mode_updated_idx
    ON agos_business_coach_sessions (user_id, mode, updated_at DESC);
"""


_DOWNGRADE_SQL = r"""
DROP TABLE IF EXISTS agos_business_coach_sessions;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
