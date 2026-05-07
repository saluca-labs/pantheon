-- SoulWatch Database Schema
-- All tables prefixed with _soulwatch_ to coexist with SoulAuth tables.
-- Run against the shared soulauth database.

-- Persisted behavioral baselines per agent
CREATE TABLE IF NOT EXISTS _soulwatch_baselines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soulkey_id      UUID NOT NULL UNIQUE,
    typical_request_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    typical_resources    JSONB DEFAULT '[]'::jsonb,
    typical_actions      JSONB DEFAULT '[]'::jsonb,
    typical_scopes       JSONB DEFAULT '[]'::jsonb,
    typical_hours        JSONB DEFAULT '[]'::jsonb,
    typical_denial_rate  DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    typical_burst_size   INTEGER NOT NULL DEFAULT 0,
    events_analyzed      INTEGER NOT NULL DEFAULT 0,
    lookback_hours       INTEGER NOT NULL DEFAULT 168,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE _soulwatch_baselines IS 'Agent behavioral baselines for anomaly detection';
CREATE INDEX IF NOT EXISTS idx_soulwatch_baselines_soulkey ON _soulwatch_baselines(soulkey_id);

-- Detected anomalies with status tracking
CREATE TABLE IF NOT EXISTS _soulwatch_anomalies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soulkey_id      UUID NOT NULL,
    tenant_id       UUID,
    anomaly_type    VARCHAR(50) NOT NULL,
    severity        VARCHAR(20) NOT NULL,
    description     TEXT NOT NULL,
    evidence        JSONB DEFAULT '{}'::jsonb,
    baseline_value  TEXT,
    observed_value  TEXT,
    status          VARCHAR(30) NOT NULL DEFAULT 'open',
    acknowledged_by TEXT,
    resolved_at     TIMESTAMPTZ,
    source_event_id UUID,
    created_at      TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT chk_anomaly_status CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive'))
);

COMMENT ON TABLE _soulwatch_anomalies IS 'Detected behavioral anomalies with lifecycle tracking';
CREATE INDEX IF NOT EXISTS idx_soulwatch_anomalies_soulkey ON _soulwatch_anomalies(soulkey_id);
CREATE INDEX IF NOT EXISTS idx_soulwatch_anomalies_type ON _soulwatch_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_soulwatch_anomalies_severity ON _soulwatch_anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_soulwatch_anomalies_status ON _soulwatch_anomalies(status);
CREATE INDEX IF NOT EXISTS idx_soulwatch_anomalies_created ON _soulwatch_anomalies(created_at);
CREATE INDEX IF NOT EXISTS idx_soulwatch_anomalies_tenant ON _soulwatch_anomalies(tenant_id);

-- Sigma rule match log
CREATE TABLE IF NOT EXISTS _soulwatch_detections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id         VARCHAR(255) NOT NULL,
    rule_title      TEXT NOT NULL,
    level           VARCHAR(30) NOT NULL,
    soulkey_id      UUID,
    tenant_id       UUID,
    matched_fields  JSONB DEFAULT '{}'::jsonb,
    event_data      JSONB DEFAULT '{}'::jsonb,
    response_playbook TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE _soulwatch_detections IS 'Sigma rule match audit log';
CREATE INDEX IF NOT EXISTS idx_soulwatch_detections_rule ON _soulwatch_detections(rule_id);
CREATE INDEX IF NOT EXISTS idx_soulwatch_detections_level ON _soulwatch_detections(level);
CREATE INDEX IF NOT EXISTS idx_soulwatch_detections_created ON _soulwatch_detections(created_at);
CREATE INDEX IF NOT EXISTS idx_soulwatch_detections_soulkey ON _soulwatch_detections(soulkey_id);

-- Quarantine records with release workflow
CREATE TABLE IF NOT EXISTS _soulwatch_quarantines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soulkey_id      UUID NOT NULL,
    tenant_id       UUID,
    persona_id      TEXT,
    triggered_by_type VARCHAR(50) NOT NULL,
    triggered_by_id TEXT,
    actions_taken   JSONB DEFAULT '[]'::jsonb,
    status          VARCHAR(30) NOT NULL DEFAULT 'active',
    reason          TEXT NOT NULL DEFAULT '',
    quarantined_at  TIMESTAMPTZ DEFAULT now(),
    released_at     TIMESTAMPTZ,
    auto_release_at TIMESTAMPTZ,
    released_by     TEXT,
    approved_by     TEXT,
    approved_at     TIMESTAMPTZ,

    CONSTRAINT chk_quarantine_status CHECK (status IN ('active', 'released', 'expired', 'pending_approval'))
);

COMMENT ON TABLE _soulwatch_quarantines IS 'Quarantine records with approval and release workflows';
CREATE INDEX IF NOT EXISTS idx_soulwatch_quarantines_soulkey ON _soulwatch_quarantines(soulkey_id);
CREATE INDEX IF NOT EXISTS idx_soulwatch_quarantines_status ON _soulwatch_quarantines(status);
CREATE INDEX IF NOT EXISTS idx_soulwatch_quarantines_tenant ON _soulwatch_quarantines(tenant_id);

-- Dead letter queue for failed SIEM forwarding
CREATE TABLE IF NOT EXISTS _soulwatch_dlq (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_data      JSONB NOT NULL,
    destination     VARCHAR(100) NOT NULL,
    error_message   TEXT,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    max_retries     INTEGER NOT NULL DEFAULT 5,
    created_at      TIMESTAMPTZ DEFAULT now(),
    last_retry_at   TIMESTAMPTZ
);

COMMENT ON TABLE _soulwatch_dlq IS 'Dead letter queue for failed SIEM event forwarding';
CREATE INDEX IF NOT EXISTS idx_soulwatch_dlq_destination ON _soulwatch_dlq(destination);
CREATE INDEX IF NOT EXISTS idx_soulwatch_dlq_created ON _soulwatch_dlq(created_at);

-- Per-tenant custom Sigma rules
CREATE TABLE IF NOT EXISTS _soulwatch_custom_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID,
    rule_id         VARCHAR(255) NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    description     TEXT,
    yaml_content    TEXT NOT NULL,
    level           VARCHAR(30) NOT NULL DEFAULT 'medium',
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_by      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE _soulwatch_custom_rules IS 'Per-tenant custom Sigma detection rules';
CREATE INDEX IF NOT EXISTS idx_soulwatch_custom_rules_tenant ON _soulwatch_custom_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_soulwatch_custom_rules_rule_id ON _soulwatch_custom_rules(rule_id);
