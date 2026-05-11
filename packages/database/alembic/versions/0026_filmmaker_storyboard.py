"""Filmmaker OS Phase 6 — storyboard + panels.

Revision ID: 0026_filmmaker_storyboard
Revises: 0025_filmmaker_production
Create Date: 2026-05-10

Phase 6 lays the storyboard layer (and the basis for downstream PDF
exports) on top of the Phase 4 scenes + Phase 5 production layer:

`agos_filmmaker_storyboards`
    A storyboard belongs to a project and optionally references a
    single scene from the head screenplay. Status drives review state
    (`draft` -> `approved` -> `archived`).

`agos_filmmaker_storyboard_panels`
    Ordered panels within a storyboard. `image_url` is a URL-string
    only — see `docs/architecture/mcp-storage-transfer.md` — no
    binary upload pathway is provided in this phase. Free-text
    `camera_angle` / `camera_move` / `shot_size` keep the schema open
    while industry shorthand stabilises across the OS.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0026_filmmaker_storyboard"
down_revision: Union[str, None] = "0025_filmmaker_production"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Storyboards -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_storyboards (
    id           UUID        PRIMARY KEY,
    project_id   UUID        NOT NULL
                             REFERENCES agos_filmmaker_projects(id)
                             ON DELETE CASCADE,
    name         TEXT        NOT NULL DEFAULT 'Storyboard 1',
    description  TEXT        NULL,
    scene_id     UUID        NULL
                             REFERENCES agos_filmmaker_screenplay_scenes(id)
                             ON DELETE SET NULL,
    status       TEXT        NOT NULL DEFAULT 'draft',
    metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_filmmaker_storyboards_status_chk
        CHECK (status IN ('draft','approved','archived'))
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_storyboards_project_idx
    ON agos_filmmaker_storyboards (project_id);

CREATE INDEX IF NOT EXISTS agos_filmmaker_storyboards_scene_idx
    ON agos_filmmaker_storyboards (scene_id)
    WHERE scene_id IS NOT NULL;

-- Panels ----------------------------------------------------------------

-- `image_url` is a URL string only; binary storage is delivered through
-- the MCP storage transfer workstream (docs/architecture/mcp-storage-transfer.md).
CREATE TABLE IF NOT EXISTS agos_filmmaker_storyboard_panels (
    id                UUID         PRIMARY KEY,
    storyboard_id     UUID         NOT NULL
                                   REFERENCES agos_filmmaker_storyboards(id)
                                   ON DELETE CASCADE,
    position          INTEGER      NOT NULL,
    image_url         TEXT         NULL,
    camera_angle      TEXT         NULL,
    camera_move       TEXT         NULL,
    shot_size         TEXT         NULL,
    description       TEXT         NULL,
    dialogue_excerpt  TEXT         NULL,
    duration_seconds  NUMERIC(5,2) NULL,
    notes             TEXT         NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_storyboard_panels_storyboard_pos_idx
    ON agos_filmmaker_storyboard_panels (storyboard_id, position);
"""

_DOWNGRADE_SQL = """
DROP TABLE IF EXISTS agos_filmmaker_storyboard_panels;
DROP TABLE IF EXISTS agos_filmmaker_storyboards;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
