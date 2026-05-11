"""CyberSec OS Phase 2 — cases, case events, case-alert links, evidence, tasks.

Revision ID: 0029_cyber_phase2
Revises: 0028_cyber_phase1
Create Date: 2026-05-10

Docstring describes Phase 2: cases, case events, case<->alerts N:N, evidence, tasks.
References: MITRE ATT&CK (CC BY 4.0): https://attack.mitre.org/

Idempotency: every DDL is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0029_cyber_phase2"
down_revision: Union[str, None] = "0028_cyber_phase1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- Cases table
CREATE TABLE IF NOT EXISTS agos_cyber_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    severity TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'p3',
    assigned_to TEXT,
    tactic TEXT,
    technique TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    closed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_cases_severity_enum CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    CONSTRAINT agos_cyber_cases_status_enum CHECK (status IN ('open', 'triage', 'investigating', 'contained', 'eradicated', 'recovered', 'closed', 'false_positive')),
    CONSTRAINT agos_cyber_cases_priority_enum CHECK (priority IN ('p1', 'p2', 'p3', 'p4', 'p5'))
);

CREATE INDEX IF NOT EXISTS agos_cyber_cases_owner_id_idx ON agos_cyber_cases (owner_id);
CREATE INDEX IF NOT EXISTS agos_cyber_cases_owner_status_idx ON agos_cyber_cases (owner_id, status);
CREATE INDEX IF NOT EXISTS agos_cyber_cases_owner_severity_idx ON agos_cyber_cases (owner_id, severity);
CREATE INDEX IF NOT EXISTS agos_cyber_cases_owner_priority_idx ON agos_cyber_cases (owner_id, priority);
CREATE INDEX IF NOT EXISTS agos_cyber_cases_tags_gin_idx ON agos_cyber_cases USING GIN (tags);

-- Case Events table
CREATE TABLE IF NOT EXISTS agos_cyber_case_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES agos_cyber_cases(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    author TEXT,
    body TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_case_events_kind_enum CHECK (kind IN ('note', 'status_change', 'alert_attached', 'alert_detached', 'evidence_added', 'evidence_removed', 'task_added', 'task_completed', 'task_reopened', 'assignment_change', 'severity_change', 'priority_change'))
);

CREATE INDEX IF NOT EXISTS agos_cyber_case_events_case_created_desc_idx ON agos_cyber_case_events (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agos_cyber_case_events_case_kind_idx ON agos_cyber_case_events (case_id, kind);

-- Case Alerts N:N Join Table
CREATE TABLE IF NOT EXISTS agos_cyber_case_alerts (
    case_id UUID NOT NULL REFERENCES agos_cyber_cases(id) ON DELETE CASCADE,
    alert_id UUID NOT NULL REFERENCES agos_cyber_alerts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (case_id, alert_id)
);

CREATE INDEX IF NOT EXISTS agos_cyber_case_alerts_alert_id_idx ON agos_cyber_case_alerts (alert_id);

-- Evidence table
CREATE TABLE IF NOT EXISTS agos_cyber_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES agos_cyber_cases(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    url TEXT,
    content TEXT,
    mime_type TEXT,
    sha256 TEXT,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    collected_by TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_evidence_kind_enum CHECK (kind IN ('file', 'url', 'command_output', 'log_excerpt', 'screenshot', 'ioc', 'other'))
);

CREATE INDEX IF NOT EXISTS agos_cyber_evidence_case_collected_desc_idx ON agos_cyber_evidence (case_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS agos_cyber_evidence_case_kind_idx ON agos_cyber_evidence (case_id, kind);
CREATE INDEX IF NOT EXISTS agos_cyber_evidence_tags_gin_idx ON agos_cyber_evidence USING GIN (tags);

-- Tasks table
CREATE TABLE IF NOT EXISTS agos_cyber_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES agos_cyber_cases(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    assigned_to TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_tasks_status_enum CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
    CONSTRAINT agos_cyber_tasks_priority_enum CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

CREATE INDEX IF NOT EXISTS agos_cyber_tasks_case_status_idx ON agos_cyber_tasks (case_id, status);
CREATE INDEX IF NOT EXISTS agos_cyber_tasks_case_position_idx ON agos_cyber_tasks (case_id, position);
CREATE INDEX IF NOT EXISTS agos_cyber_tasks_case_assigned_to_idx ON agos_cyber_tasks (case_id, assigned_to);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_cyber_tasks_case_assigned_to_idx;
DROP INDEX IF EXISTS agos_cyber_tasks_case_position_idx;
DROP INDEX IF EXISTS agos_cyber_tasks_case_status_idx;
DROP TABLE IF EXISTS agos_cyber_tasks;

DROP INDEX IF EXISTS agos_cyber_evidence_tags_gin_idx;
DROP INDEX IF EXISTS agos_cyber_evidence_case_kind_idx;
DROP INDEX IF EXISTS agos_cyber_evidence_case_collected_desc_idx;
DROP TABLE IF EXISTS agos_cyber_evidence;

DROP INDEX IF EXISTS agos_cyber_case_alerts_alert_id_idx;
DROP TABLE IF EXISTS agos_cyber_case_alerts;

DROP INDEX IF EXISTS agos_cyber_case_events_case_kind_idx;
DROP INDEX IF EXISTS agos_cyber_case_events_case_created_desc_idx;
DROP TABLE IF EXISTS agos_cyber_case_events;

DROP INDEX IF EXISTS agos_cyber_cases_tags_gin_idx;
DROP INDEX IF EXISTS agos_cyber_cases_owner_priority_idx;
DROP INDEX IF EXISTS agos_cyber_cases_owner_severity_idx;
DROP INDEX IF EXISTS agos_cyber_cases_owner_status_idx;
DROP INDEX IF EXISTS agos_cyber_cases_owner_id_idx;
DROP TABLE IF EXISTS agos_cyber_cases;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
