"""Maker OS vertical tables: builds and parts inventory.

Revision ID: 0004_maker_os
Revises: 0003_agentic_os
Create Date: 2026-05-08

Introduces Maker OS domain tables:
- ``agos_maker_builds`` — one row per hardware/fabrication project.
- ``agos_maker_parts``  — BOM / parts inventory rows per build.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``) so re-applies are safe.

References:
  - BOM entity model inspired by IndaBOM conventions (MIT): https://indabom.com/
  - Part category taxonomy based on common maker/hardware terminology (public domain).
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0004_maker_os"
down_revision: Union[str, None] = "0003_agentic_os"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Maker OS: build projects -------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_builds (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'planning',
                -- planning | in_progress | on_hold | complete | archived
    tags        JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_maker_builds_user_idx
    ON agos_maker_builds (user_id, updated_at DESC);

-- Maker OS: parts / BOM rows -----------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_parts (
    id          UUID PRIMARY KEY,
    build_id    UUID NOT NULL REFERENCES agos_maker_builds(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'other',
                -- electronic | mechanical | fastener | material | tool | consumable | other
    quantity    INT  NOT NULL DEFAULT 1,
    unit        TEXT NOT NULL DEFAULT 'pcs',
    notes       TEXT,
    source_url  TEXT,
    in_stock    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_maker_parts_build_idx
    ON agos_maker_parts (build_id, category, name);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_maker_parts_build_idx;
DROP TABLE IF EXISTS agos_maker_parts;

DROP INDEX IF EXISTS agos_maker_builds_user_idx;
DROP TABLE IF EXISTS agos_maker_builds;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
