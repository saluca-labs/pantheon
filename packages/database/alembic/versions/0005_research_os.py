"""Research OS vertical tables: hypotheses and experiments.

Revision ID: 0005_research_os
Revises: 0004_maker_os
Create Date: 2026-05-08

Introduces Research OS domain tables:
- ``agos_research_hypotheses``  — hypothesis ledger (If/then/because model).
- ``agos_research_experiments`` — experiment designs linked to a hypothesis.

References:
  - Scientific hypothesis model (If/Then/Because) — public domain convention:
    https://www.sciencebuddies.org/science-fair-projects/science-fair/steps-of-the-scientific-method
  - NIH Research Methods Glossary (public domain):
    https://www.niaid.nih.gov/research/glossary-of-research-terms

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``).
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0005_research_os"
down_revision: Union[str, None] = "0004_maker_os"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Research OS: hypothesis ledger -------------------------------------------

CREATE TABLE IF NOT EXISTS agos_research_hypotheses (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL,
    title           TEXT NOT NULL,
    if_clause       TEXT NOT NULL,
    then_clause     TEXT NOT NULL,
    because_clause  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
                    -- draft | active | testing | supported | refuted | inconclusive | archived
    confidence      TEXT NOT NULL DEFAULT 'medium',
                    -- low | medium | high
    tags            JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_research_hypotheses_user_idx
    ON agos_research_hypotheses (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agos_research_hypotheses_status_idx
    ON agos_research_hypotheses (user_id, status);

-- Research OS: experiment designs ------------------------------------------

CREATE TABLE IF NOT EXISTS agos_research_experiments (
    id               UUID PRIMARY KEY,
    hypothesis_id    UUID NOT NULL REFERENCES agos_research_hypotheses(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL,
    title            TEXT NOT NULL,
    independent      TEXT NOT NULL DEFAULT '',
    dependent        TEXT NOT NULL DEFAULT '',
    controls         TEXT NOT NULL DEFAULT '',
    protocol         TEXT NOT NULL DEFAULT '',
    success_criteria TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'planned',
                     -- planned | running | done
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_research_experiments_hypothesis_idx
    ON agos_research_experiments (hypothesis_id, created_at DESC);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_research_experiments_hypothesis_idx;
DROP TABLE IF EXISTS agos_research_experiments;

DROP INDEX IF EXISTS agos_research_hypotheses_status_idx;
DROP INDEX IF EXISTS agos_research_hypotheses_user_idx;
DROP TABLE IF EXISTS agos_research_hypotheses;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
