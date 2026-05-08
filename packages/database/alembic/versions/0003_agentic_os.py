"""Agentic OS shared schema + Health OS vertical tables.

Revision ID: 0003_agentic_os
Revises: 0002_v3_platform_tables
Create Date: 2026-05-07

This migration introduces the shared ``agos_*`` schema used by every
Agentic OS module (Health, Maker, Research, Secure-Dev, Filmmaker, Cyber,
Autobiographer, Business, Creator) plus the Health OS vertical-specific
tables.

Shared tables
-------------
- ``agos_projects``     — one row per (user, OS) project / workspace.
- ``agos_entities``     — generic typed entity store (per-OS payload JSON).
- ``agos_settings``     — per-project key/value settings.
- ``agos_audit``        — append-only audit log of agent / user actions.

Health OS tables
----------------
- ``agos_health_profile``   — per-user demographics, goals, conditions.
- ``agos_health_intake``    — intake responses (free-text + structured).
- ``agos_health_screeners`` — PHQ-9 / GAD-7 results with crisis-flag.
- ``agos_health_logs``      — daily log: meals, mood, vitals, notes.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``) so first-boot
bootstrap and re-applies are safe.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0003_agentic_os"
down_revision: Union[str, None] = "0002_v3_platform_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Shared agos_* schema -------------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_projects (
    id UUID PRIMARY KEY,
    os_slug TEXT NOT NULL,
    owner_id UUID NOT NULL,
    name TEXT NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_projects_owner_idx
    ON agos_projects (owner_id, os_slug);

CREATE TABLE IF NOT EXISTS agos_entities (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES agos_projects(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_entities_project_type_idx
    ON agos_entities (project_id, entity_type);

CREATE TABLE IF NOT EXISTS agos_settings (
    project_id UUID NOT NULL REFERENCES agos_projects(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, key)
);

CREATE TABLE IF NOT EXISTS agos_audit (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES agos_projects(id) ON DELETE SET NULL,
    actor_id UUID,
    os_slug TEXT NOT NULL,
    action TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_audit_project_created_idx
    ON agos_audit (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agos_audit_actor_created_idx
    ON agos_audit (actor_id, created_at DESC);

-- Health OS vertical tables --------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_health_profile (
    user_id UUID PRIMARY KEY,
    sex TEXT,
    date_of_birth DATE,
    height_cm NUMERIC(6,2),
    weight_kg NUMERIC(6,2),
    activity_level TEXT,
    goals JSONB NOT NULL DEFAULT '[]'::jsonb,
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
    medications JSONB NOT NULL DEFAULT '[]'::jsonb,
    allergies JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agos_health_intake (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    intake_kind TEXT NOT NULL,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    free_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_health_intake_user_idx
    ON agos_health_intake (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agos_health_screeners (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    screener TEXT NOT NULL,         -- 'phq9' | 'gad7'
    answers JSONB NOT NULL,         -- list of integer responses
    score INT NOT NULL,
    severity TEXT NOT NULL,         -- minimal/mild/moderate/moderately_severe/severe
    crisis_flag BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_health_screeners_user_idx
    ON agos_health_screeners (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agos_health_screeners_crisis_idx
    ON agos_health_screeners (user_id, crisis_flag, created_at DESC);

CREATE TABLE IF NOT EXISTS agos_health_logs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    log_kind TEXT NOT NULL,         -- 'meal' | 'mood' | 'vitals' | 'note' | 'sleep' | 'exercise'
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_health_logs_user_kind_idx
    ON agos_health_logs (user_id, log_kind, occurred_at DESC);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_health_logs_user_kind_idx;
DROP TABLE IF EXISTS agos_health_logs;

DROP INDEX IF EXISTS agos_health_screeners_crisis_idx;
DROP INDEX IF EXISTS agos_health_screeners_user_idx;
DROP TABLE IF EXISTS agos_health_screeners;

DROP INDEX IF EXISTS agos_health_intake_user_idx;
DROP TABLE IF EXISTS agos_health_intake;

DROP TABLE IF EXISTS agos_health_profile;

DROP INDEX IF EXISTS agos_audit_actor_created_idx;
DROP INDEX IF EXISTS agos_audit_project_created_idx;
DROP TABLE IF EXISTS agos_audit;

DROP TABLE IF EXISTS agos_settings;

DROP INDEX IF EXISTS agos_entities_project_type_idx;
DROP TABLE IF EXISTS agos_entities;

DROP INDEX IF EXISTS agos_projects_owner_idx;
DROP TABLE IF EXISTS agos_projects;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
