"""Filmmaker OS — extended projects table with status, tags, and description.

Revision ID: 0012_filmmaker_projects
Revises: 0011_creator_os
Create Date: 2026-05-07

Adds a new `agos_filmmaker_projects` table that supersedes the slim title/
synopsis table from migration 0008. The new table follows the Maker OS
`agos_maker_builds` pattern: name, description, status enum, and a JSONB
tags array. The legacy table from 0008 continues to exist alongside this
one; the new projects vertical is accessed by the /filmmaker/projects BFF
routes added in Workstream B.

Status values mirror industry-standard film production phases:
  pre_production / production / post_production / wrapped / archived

All DDL is idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT
EXISTS) so re-running the migration is safe.

License note: All DDL is original work under MIT. No GPL code is introduced.

References:
  - Film production phase taxonomy: https://www.studiobinder.com/blog/pre-production/
    (StudioBinder "Pre-Production Ultimate Guide" — public-domain reference)
  - Pattern mirrors agos_maker_builds from 0004_maker_os.py (MIT).
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0012_filmmaker_projects"
down_revision: Union[str, None] = "0011_creator_os"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Filmmaker OS — extended projects table (Workstream B) -----------------
-- New table: agos_filmmaker_projects (with status, tags, description)
-- Mirrors the agos_maker_builds pattern for the full project-management
-- vertical. Status values track industry-standard film production phases.
-- Ref: https://www.studiobinder.com/blog/pre-production/

CREATE TABLE IF NOT EXISTS agos_filmmaker_projects (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL,
    name        TEXT        NOT NULL,
    description TEXT,
    status      TEXT        NOT NULL DEFAULT 'pre_production',
    tags        TEXT[]      DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_projects_user_updated_idx
    ON agos_filmmaker_projects (user_id, updated_at DESC);
"""

_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_filmmaker_projects_user_updated_idx;
DROP TABLE IF EXISTS agos_filmmaker_projects CASCADE;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
