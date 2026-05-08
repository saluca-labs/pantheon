"""Agentic OS — per-user feature flags table.

Revision ID: 0013_agos_feature_flags
Revises: 0012_filmmaker_projects
Create Date: 2026-05-07

Adds `agos_feature_flags` — a per-user boolean toggle for each Agentic OS
module.  Default for every row is TRUE so that existing users are not
affected by the migration (opt-out model, not opt-in).

The flag is a UX gate only; BFF routes for disabled OSes continue to
respond normally.

All DDL is idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT
EXISTS) so re-running the migration is safe.

License note: All DDL is original work under MIT. No GPL code is introduced.
"""

from alembic import op
import sqlalchemy as sa

# Alembic metadata
revision = "0013_agos_feature_flags"
down_revision = "0012_filmmaker_projects"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS agos_feature_flags (
            user_id    UUID        NOT NULL,
            os_slug    TEXT        NOT NULL,
            enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, os_slug)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS agos_feature_flags_user_idx
            ON agos_feature_flags (user_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agos_feature_flags")
