"""Secure-Dev OS vertical tables: threat models and vulnerability findings.

Revision ID: 0006_secure_dev_os
Revises: 0005_research_os
Create Date: 2026-05-08

Introduces Secure-Dev OS domain tables:
- ``agos_secdev_threat_models`` — saved STRIDE threat-model checklists.
- ``agos_secdev_findings``      — vulnerability findings / remediation tasks.

References:
  - STRIDE threat model: Microsoft SDL (public domain):
    https://www.microsoft.com/en-us/securityengineering/sdl/threatmodeling
  - OWASP Threat Modeling Process (Apache-2.0):
    https://owasp.org/www-community/Threat_Modeling_Process

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``).
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0006_secure_dev_os"
down_revision: Union[str, None] = "0005_research_os"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Secure-Dev OS: STRIDE threat-model reports ------------------------------

CREATE TABLE IF NOT EXISTS agos_secdev_threat_models (
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL,
    system_name         TEXT NOT NULL,
    system_description  TEXT NOT NULL,
    checklist           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_secdev_threat_models_user_idx
    ON agos_secdev_threat_models (user_id, created_at DESC);

-- Secure-Dev OS: vulnerability findings / remediation tasks ---------------

CREATE TABLE IF NOT EXISTS agos_secdev_findings (
    id               UUID PRIMARY KEY,
    threat_model_id  UUID REFERENCES agos_secdev_threat_models(id) ON DELETE SET NULL,
    user_id          UUID NOT NULL,
    title            TEXT NOT NULL,
    stride_category  TEXT,
    severity         TEXT NOT NULL DEFAULT 'medium',
                     -- high | medium | low
    status           TEXT NOT NULL DEFAULT 'open',
                     -- open | in_remediation | resolved | accepted_risk
    description      TEXT,
    mitigation       TEXT,
    reference_url    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_secdev_findings_user_idx
    ON agos_secdev_findings (user_id, severity, status);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_secdev_findings_user_idx;
DROP TABLE IF EXISTS agos_secdev_findings;

DROP INDEX IF EXISTS agos_secdev_threat_models_user_idx;
DROP TABLE IF EXISTS agos_secdev_threat_models;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
