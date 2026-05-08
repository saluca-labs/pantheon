"""CyberSec OS vertical tables: alerts and triage.

Revision ID: 0007_cyber_os
Revises: 0006_secure_dev_os
Create Date: 2026-05-08

Introduces CyberSec OS domain tables:
- ``agos_cyber_alerts``  — normalised alert records from SIEM/IDS/EDR sources.
- ``agos_cyber_playbooks`` — response playbook stubs (referenced by alert triage).

References:
  - Alert severity taxonomy per CVSS v3.1 (public domain):
    https://www.first.org/cvss/v3.1/specification-document
  - MITRE ATT&CK technique IDs (CC BY 4.0):
    https://attack.mitre.org/
  - Wazuh alert rule taxonomy (GPL):
    https://documentation.wazuh.com/current/user-manual/ruleset/

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``).
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0007_cyber_os"
down_revision: Union[str, None] = "0006_secure_dev_os"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- CyberSec OS: alert triage queue -----------------------------------------

CREATE TABLE IF NOT EXISTS agos_cyber_alerts (
    id          UUID PRIMARY KEY,
    owner_id    UUID NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    severity    TEXT NOT NULL DEFAULT 'medium',
                -- critical | high | medium | low | info
    category    TEXT NOT NULL DEFAULT 'other',
                -- authentication | network | malware | data_exfiltration
                -- | privilege_escalation | vulnerability | policy_violation | other
    status      TEXT NOT NULL DEFAULT 'open',
                -- open | investigating | resolved | false_positive
    source      TEXT NOT NULL DEFAULT '',
    source_ip   INET,
    assigned_to TEXT,
    notes       TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_cyber_alerts_owner_idx
    ON agos_cyber_alerts (owner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS agos_cyber_alerts_status_sev_idx
    ON agos_cyber_alerts (owner_id, status, severity);

-- CyberSec OS: response playbook stubs ------------------------------------

CREATE TABLE IF NOT EXISTS agos_cyber_playbooks (
    id          UUID PRIMARY KEY,
    owner_id    UUID NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT,
    steps       JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_cyber_playbooks_owner_idx
    ON agos_cyber_playbooks (owner_id);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_cyber_playbooks_owner_idx;
DROP TABLE IF EXISTS agos_cyber_playbooks;

DROP INDEX IF EXISTS agos_cyber_alerts_status_sev_idx;
DROP INDEX IF EXISTS agos_cyber_alerts_owner_idx;
DROP TABLE IF EXISTS agos_cyber_alerts;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
