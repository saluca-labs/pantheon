"""Filmmaker OS vertical tables.

Revision ID: 0008_filmmaker_os
Revises: 0003_agentic_os
Create Date: 2026-05-07

Adds the Filmmaker OS schema: film projects and a shot list per project.
Shot types follow the ASC (American Society of Cinematographers) taxonomy:
https://www.ascmag.com/articles/shot-types-and-camera-angles

All DDL is idempotent (CREATE TABLE IF NOT EXISTS) so first-boot bootstrap
and re-applies are safe.

License note: All DDL is original work under MIT. No GPL code is introduced.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0008_filmmaker_os"
down_revision: Union[str, None] = "0007_cyber_os"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Filmmaker OS vertical tables -------------------------------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_projects (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    synopsis TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_filmmaker_projects_user_idx
    ON agos_filmmaker_projects (user_id, updated_at DESC);

-- Shot list: one row per camera set-up within a scene.
-- shot_type follows ASC taxonomy: EWS/WS/MS/MCU/CU/ECU/OTS/POV/INSERT
-- Ref: https://www.ascmag.com/articles/shot-types-and-camera-angles
CREATE TABLE IF NOT EXISTS agos_filmmaker_shots (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES agos_filmmaker_projects(id) ON DELETE CASCADE,
    scene_number TEXT NOT NULL,
    shot_number TEXT NOT NULL,
    shot_type TEXT NOT NULL DEFAULT 'MS',
    camera_move TEXT NOT NULL DEFAULT 'STATIC',
    subject TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    estimated_seconds INT,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_filmmaker_shots_project_idx
    ON agos_filmmaker_shots (project_id, scene_number, shot_number);
"""

_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_filmmaker_shots_project_idx;
DROP TABLE IF EXISTS agos_filmmaker_shots;

DROP INDEX IF EXISTS agos_filmmaker_projects_user_idx;
DROP TABLE IF EXISTS agos_filmmaker_projects;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
