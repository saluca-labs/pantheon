"""Shared updated_at trigger function — prelude migration.

Revision ID: 0067a_shared_updated_at_fn
Revises: 0067_creator_phase6
Create Date: 2026-05-13

Defines the canonical ``update_updated_at_column()`` PL/pgSQL function so
later migrations can attach BEFORE UPDATE triggers without redefining the
function (or worse, depending on it being defined ad-hoc elsewhere). The
function is created with ``CREATE OR REPLACE`` so the migration is fully
idempotent and can be re-applied without error on environments that already
have a copy of the function.

Why a prelude migration
-----------------------
Several Phase 5/6/7 migrations (Business OS quotes/invoices/expenses/p&l,
Creator OS subscribers/books, Autobiographer chapter revisions) attach
triggers that expect ``update_updated_at_column()`` to exist. Rather than
duplicating the function definition in every migration (and risking drift),
this prelude defines it once. Subsequent migrations simply
``CREATE TRIGGER ... EXECUTE FUNCTION update_updated_at_column()``.

Alembic bind-marker safety
--------------------------
The SQL body below uses ``$$ ... $$`` dollar-quoting (not single-quoted
strings) for the function body. This avoids the SQLAlchemy ``text()``
bind-marker footgun where ``:int`` / ``:[letter]`` inside single-quoted SQL
gets parsed as a bind parameter. ``op.execute`` of a raw Python string also
bypasses ``text()`` entirely — belt and braces.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0067a_shared_updated_at_fn"
down_revision: Union[str, None] = "0067_creator_phase6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

_DOWNGRADE_SQL = r"""
DROP FUNCTION IF EXISTS update_updated_at_column();
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
