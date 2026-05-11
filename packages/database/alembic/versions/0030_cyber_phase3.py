"""CyberSec OS Phase 3 - detection rules + playbook runner."""

from typing import Sequence, Union

from alembic import op


revision: str = "0030_cyber_phase3"
down_revision: Union[str, None] = "0029_cyber_phase2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
CREATE TABLE IF NOT EXISTS agos_cyber_detection_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    author TEXT,
    lifecycle TEXT NOT NULL DEFAULT 'draft',
    severity TEXT NOT NULL DEFAULT 'medium',
    tactic TEXT,
    technique TEXT,
    log_source_kind TEXT,
    detection JSONB NOT NULL DEFAULT '{}'::jsonb,
    false_positives TEXT[] NOT NULL DEFAULT '{}',
    "references" TEXT[] NOT NULL DEFAULT '{}',
    tags TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_detection_rules_lifecycle_enum CHECK (lifecycle IN ('draft','testing','active','deprecated','archived')),
    CONSTRAINT agos_cyber_detection_rules_severity_enum CHECK (severity IN ('critical','high','medium','low','info')),
    CONSTRAINT agos_cyber_detection_rules_log_source_kind_enum CHECK (log_source_kind IS NULL OR log_source_kind IN ('siem','edr','ids','cloud_audit','firewall','osquery','syslog','webhook','other'))
);

CREATE INDEX IF NOT EXISTS agos_cyber_detection_rules_owner_id_idx ON agos_cyber_detection_rules (owner_id);
CREATE INDEX IF NOT EXISTS agos_cyber_detection_rules_owner_lifecycle_idx ON agos_cyber_detection_rules (owner_id, lifecycle);
CREATE INDEX IF NOT EXISTS agos_cyber_detection_rules_owner_severity_idx ON agos_cyber_detection_rules (owner_id, severity);
CREATE INDEX IF NOT EXISTS agos_cyber_detection_rules_tags_gin_idx ON agos_cyber_detection_rules USING GIN (tags);

CREATE TABLE IF NOT EXISTS agos_cyber_detection_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES agos_cyber_detection_rules(id) ON DELETE CASCADE,
    alert_id UUID REFERENCES agos_cyber_alerts(id) ON DELETE SET NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_cyber_detection_runs_rule_triggered_desc_idx ON agos_cyber_detection_runs (rule_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS agos_cyber_detection_runs_alert_id_idx ON agos_cyber_detection_runs (alert_id) WHERE alert_id IS NOT NULL;

ALTER TABLE agos_cyber_playbooks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE agos_cyber_playbooks ADD COLUMN IF NOT EXISTS lifecycle TEXT NOT NULL DEFAULT 'active';
ALTER TABLE agos_cyber_playbooks ADD COLUMN IF NOT EXISTS tactic TEXT;
ALTER TABLE agos_cyber_playbooks ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE agos_cyber_playbooks ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agos_cyber_playbooks_lifecycle_enum') THEN
        ALTER TABLE agos_cyber_playbooks ADD CONSTRAINT agos_cyber_playbooks_lifecycle_enum CHECK (lifecycle IN ('draft','testing','active','deprecated','archived'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS agos_cyber_playbooks_owner_lifecycle_idx ON agos_cyber_playbooks (owner_id, lifecycle);

CREATE TABLE IF NOT EXISTS agos_cyber_playbook_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playbook_id UUID NOT NULL REFERENCES agos_cyber_playbooks(id) ON DELETE RESTRICT,
    owner_id UUID NOT NULL,
    case_id UUID REFERENCES agos_cyber_cases(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_playbook_runs_status_enum CHECK (status IN ('in_progress','completed','abandoned'))
);

CREATE INDEX IF NOT EXISTS agos_cyber_playbook_runs_owner_status_idx ON agos_cyber_playbook_runs (owner_id, status);
CREATE INDEX IF NOT EXISTS agos_cyber_playbook_runs_playbook_started_desc_idx ON agos_cyber_playbook_runs (playbook_id, started_at DESC);
CREATE INDEX IF NOT EXISTS agos_cyber_playbook_runs_case_id_idx ON agos_cyber_playbook_runs (case_id) WHERE case_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agos_cyber_playbook_step_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES agos_cyber_playbook_runs(id) ON DELETE CASCADE,
    step_index INT NOT NULL,
    step_snapshot JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_playbook_step_runs_status_enum CHECK (status IN ('pending','in_progress','completed','skipped','blocked')),
    CONSTRAINT agos_cyber_playbook_step_runs_run_index_unique UNIQUE (run_id, step_index)
);

CREATE INDEX IF NOT EXISTS agos_cyber_playbook_step_runs_run_index_idx ON agos_cyber_playbook_step_runs (run_id, step_index);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_cyber_playbook_step_runs_run_index_idx;
DROP TABLE IF EXISTS agos_cyber_playbook_step_runs;
DROP INDEX IF EXISTS agos_cyber_playbook_runs_case_id_idx;
DROP INDEX IF EXISTS agos_cyber_playbook_runs_playbook_started_desc_idx;
DROP INDEX IF EXISTS agos_cyber_playbook_runs_owner_status_idx;
DROP TABLE IF EXISTS agos_cyber_playbook_runs;
DROP INDEX IF EXISTS agos_cyber_playbooks_owner_lifecycle_idx;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agos_cyber_playbooks_lifecycle_enum') THEN
        ALTER TABLE agos_cyber_playbooks DROP CONSTRAINT agos_cyber_playbooks_lifecycle_enum;
    END IF;
END $$;
ALTER TABLE agos_cyber_playbooks DROP COLUMN IF EXISTS metadata;
ALTER TABLE agos_cyber_playbooks DROP COLUMN IF EXISTS tags;
ALTER TABLE agos_cyber_playbooks DROP COLUMN IF EXISTS tactic;
ALTER TABLE agos_cyber_playbooks DROP COLUMN IF EXISTS lifecycle;
ALTER TABLE agos_cyber_playbooks DROP COLUMN IF EXISTS description;
DROP INDEX IF EXISTS agos_cyber_detection_runs_alert_id_idx;
DROP INDEX IF EXISTS agos_cyber_detection_runs_rule_triggered_desc_idx;
DROP TABLE IF EXISTS agos_cyber_detection_runs;
DROP INDEX IF EXISTS agos_cyber_detection_rules_tags_gin_idx;
DROP INDEX IF EXISTS agos_cyber_detection_rules_owner_severity_idx;
DROP INDEX IF EXISTS agos_cyber_detection_rules_owner_lifecycle_idx;
DROP INDEX IF EXISTS agos_cyber_detection_rules_owner_id_idx;
DROP TABLE IF EXISTS agos_cyber_detection_rules;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
