"""Autobiographer OS vertical tables.

Revision ID: 0009_autobiographer_os
Revises: 0008_filmmaker_os
Create Date: 2026-05-07

Adds the Autobiographer OS schema: chapters (prose + word count) and life
events (typed narrative anchors).

Life-event kind taxonomy is derived from McAdams (2001) life-story narrative
categories:
  McAdams, D.P. (2001). The psychology of life stories.
  Review of General Psychology, 5(2), 100-122.
  https://doi.org/10.1111/1467-8721.00097

All DDL is idempotent (CREATE TABLE IF NOT EXISTS).
License note: All DDL is original work under MIT. No GPL code is introduced.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0009_autobiographer_os"
down_revision: Union[str, None] = "0008_filmmaker_os"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Autobiographer OS vertical tables --------------------------------------

-- Chapter: a prose passage covering a period of the author's life.
-- status: draft | in_review | final
CREATE TABLE IF NOT EXISTS agos_autobiographer_chapters (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    body_text TEXT NOT NULL DEFAULT '',
    period_label TEXT,                          -- e.g. "Childhood, 1985-1995"
    status TEXT NOT NULL DEFAULT 'draft',       -- draft | in_review | final
    word_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_autobiographer_chapters_user_idx
    ON agos_autobiographer_chapters (user_id, updated_at DESC);

-- Life event: a discrete moment anchored to a chapter.
-- kind taxonomy from McAdams (2001): milestone, turning_point, challenge,
-- achievement, relationship, place, belief, other.
CREATE TABLE IF NOT EXISTS agos_autobiographer_events (
    id UUID PRIMARY KEY,
    chapter_id UUID NOT NULL REFERENCES agos_autobiographer_chapters(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    kind TEXT NOT NULL DEFAULT 'milestone',
    headline TEXT NOT NULL,
    detail TEXT,
    occurred_year INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_autobiographer_events_chapter_idx
    ON agos_autobiographer_events (chapter_id, occurred_year ASC NULLS LAST);
"""

_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_autobiographer_events_chapter_idx;
DROP TABLE IF EXISTS agos_autobiographer_events;

DROP INDEX IF EXISTS agos_autobiographer_chapters_user_idx;
DROP TABLE IF EXISTS agos_autobiographer_chapters;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
