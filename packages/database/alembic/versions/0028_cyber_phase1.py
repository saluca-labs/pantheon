"""CyberSec OS Phase 1 — assets, asset groups, log sources, alert enrichment.

Revision ID: 0028_cyber_phase1
Revises: 0027_filmmaker_coach
Create Date: 2026-05-10

Adds the Phase-1 foundation for Cyber OS:

- ``agos_cyber_assets``                — protected entities (hosts, containers,
  SaaS accounts, repos, cloud resources, users, network devices, IoT, DBs).
- ``agos_cyber_asset_groups``          — lightweight named groupings.
- ``agos_cyber_asset_group_members``   — N:N join.
- ``agos_cyber_log_sources``           — systems that emit alerts (SIEM, EDR,
  IDS, CloudTrail, etc.). Informational only in Phase 1 — no live ingestion.

Extends ``agos_cyber_alerts`` (from 0007_cyber_os) with enrichment columns:
``asset_id``, ``log_source_id``, ``tactic``, ``technique``, ``correlation_id``,
``tags``, ``raw_jsonb``.

References:
  - MITRE ATT&CK tactic/technique IDs (CC BY 4.0): https://attack.mitre.org/

Idempotency: every DDL is ``IF NOT EXISTS`` / ``ADD COLUMN IF NOT EXISTS``.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0028_cyber_phase1"
down_revision: Union[str, None] = "0027_filmmaker_coach"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- Assets ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_cyber_assets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id          UUID NOT NULL,
    name              TEXT NOT NULL,
    kind              TEXT NOT NULL DEFAULT 'host',
    criticality       TEXT NOT NULL DEFAULT 'medium',
    environment       TEXT,
    hostname          TEXT,
    ip_address        INET,
    os_family         TEXT,
    os_version        TEXT,
    owner_email       TEXT,
    tags              TEXT[] NOT NULL DEFAULT '{}',
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    decommissioned_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_assets_kind_enum CHECK (kind IN (
        'host','container','saas_account','repository','cloud_resource',
        'user','network_device','iot_device','database','other'
    )),
    CONSTRAINT agos_cyber_assets_criticality_enum CHECK (criticality IN (
        'low','medium','high','critical'
    ))
);

CREATE INDEX IF NOT EXISTS agos_cyber_assets_owner_idx
    ON agos_cyber_assets (owner_id);
CREATE INDEX IF NOT EXISTS agos_cyber_assets_owner_kind_idx
    ON agos_cyber_assets (owner_id, kind);
CREATE INDEX IF NOT EXISTS agos_cyber_assets_owner_crit_idx
    ON agos_cyber_assets (owner_id, criticality);
CREATE INDEX IF NOT EXISTS agos_cyber_assets_tags_gin_idx
    ON agos_cyber_assets USING GIN (tags);
CREATE INDEX IF NOT EXISTS agos_cyber_assets_active_owner_idx
    ON agos_cyber_assets (owner_id)
    WHERE decommissioned_at IS NULL;

-- Asset groups ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_cyber_asset_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    tags        TEXT[] NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_asset_groups_owner_name_unique UNIQUE (owner_id, name)
);

CREATE INDEX IF NOT EXISTS agos_cyber_asset_groups_owner_idx
    ON agos_cyber_asset_groups (owner_id);

CREATE TABLE IF NOT EXISTS agos_cyber_asset_group_members (
    group_id   UUID NOT NULL REFERENCES agos_cyber_asset_groups(id) ON DELETE CASCADE,
    asset_id   UUID NOT NULL REFERENCES agos_cyber_assets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, asset_id)
);

CREATE INDEX IF NOT EXISTS agos_cyber_asset_group_members_asset_idx
    ON agos_cyber_asset_group_members (asset_id);

-- Log sources -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_cyber_log_sources (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      UUID NOT NULL,
    name          TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'other',
    vendor        TEXT,
    endpoint_hint TEXT,
    status        TEXT NOT NULL DEFAULT 'active',
    notes         TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_log_sources_kind_enum CHECK (kind IN (
        'siem','edr','network_ids','cloud_audit','firewall','app_log',
        'identity_provider','webhook','other'
    )),
    CONSTRAINT agos_cyber_log_sources_status_enum CHECK (status IN (
        'active','paused','misconfigured','decommissioned'
    ))
);

CREATE INDEX IF NOT EXISTS agos_cyber_log_sources_owner_idx
    ON agos_cyber_log_sources (owner_id);
CREATE INDEX IF NOT EXISTS agos_cyber_log_sources_owner_status_idx
    ON agos_cyber_log_sources (owner_id, status);

-- Alerts: enrichment columns ---------------------------------------------
ALTER TABLE agos_cyber_alerts
    ADD COLUMN IF NOT EXISTS asset_id UUID
        REFERENCES agos_cyber_assets(id) ON DELETE SET NULL;
ALTER TABLE agos_cyber_alerts
    ADD COLUMN IF NOT EXISTS log_source_id UUID
        REFERENCES agos_cyber_log_sources(id) ON DELETE SET NULL;
ALTER TABLE agos_cyber_alerts
    ADD COLUMN IF NOT EXISTS tactic TEXT;
ALTER TABLE agos_cyber_alerts
    ADD COLUMN IF NOT EXISTS technique TEXT;
ALTER TABLE agos_cyber_alerts
    ADD COLUMN IF NOT EXISTS correlation_id UUID;
ALTER TABLE agos_cyber_alerts
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE agos_cyber_alerts
    ADD COLUMN IF NOT EXISTS raw_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS agos_cyber_alerts_asset_idx
    ON agos_cyber_alerts (asset_id)
    WHERE asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agos_cyber_alerts_log_source_idx
    ON agos_cyber_alerts (log_source_id)
    WHERE log_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agos_cyber_alerts_correlation_idx
    ON agos_cyber_alerts (correlation_id)
    WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agos_cyber_alerts_tags_gin_idx
    ON agos_cyber_alerts USING GIN (tags);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_cyber_alerts_tags_gin_idx;
DROP INDEX IF EXISTS agos_cyber_alerts_correlation_idx;
DROP INDEX IF EXISTS agos_cyber_alerts_log_source_idx;
DROP INDEX IF EXISTS agos_cyber_alerts_asset_idx;

ALTER TABLE agos_cyber_alerts DROP COLUMN IF EXISTS raw_jsonb;
ALTER TABLE agos_cyber_alerts DROP COLUMN IF EXISTS tags;
ALTER TABLE agos_cyber_alerts DROP COLUMN IF EXISTS correlation_id;
ALTER TABLE agos_cyber_alerts DROP COLUMN IF EXISTS technique;
ALTER TABLE agos_cyber_alerts DROP COLUMN IF EXISTS tactic;
ALTER TABLE agos_cyber_alerts DROP COLUMN IF EXISTS log_source_id;
ALTER TABLE agos_cyber_alerts DROP COLUMN IF EXISTS asset_id;

DROP INDEX IF EXISTS agos_cyber_log_sources_owner_status_idx;
DROP INDEX IF EXISTS agos_cyber_log_sources_owner_idx;
DROP TABLE IF EXISTS agos_cyber_log_sources;

DROP INDEX IF EXISTS agos_cyber_asset_group_members_asset_idx;
DROP TABLE IF EXISTS agos_cyber_asset_group_members;

DROP INDEX IF EXISTS agos_cyber_asset_groups_owner_idx;
DROP TABLE IF EXISTS agos_cyber_asset_groups;

DROP INDEX IF EXISTS agos_cyber_assets_active_owner_idx;
DROP INDEX IF EXISTS agos_cyber_assets_tags_gin_idx;
DROP INDEX IF EXISTS agos_cyber_assets_owner_crit_idx;
DROP INDEX IF EXISTS agos_cyber_assets_owner_kind_idx;
DROP INDEX IF EXISTS agos_cyber_assets_owner_idx;
DROP TABLE IF EXISTS agos_cyber_assets;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
