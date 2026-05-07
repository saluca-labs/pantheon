-- SoulGate schema - API Security Gateway tables
-- These tables are auto-created by SQLAlchemy on startup,
-- but this file serves as the canonical reference.

-- API Keys
CREATE TABLE IF NOT EXISTS _soulgate_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    label VARCHAR(255) NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix VARCHAR(12) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    scopes JSONB DEFAULT '[]',
    rate_limit_override JSONB,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    rotated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_soulgate_api_keys_tenant ON _soulgate_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_soulgate_api_keys_prefix ON _soulgate_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_soulgate_api_keys_status ON _soulgate_api_keys(status);

-- Rate Limits
CREATE TABLE IF NOT EXISTS _soulgate_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    soulkey_id UUID,
    persona_id VARCHAR(255),
    endpoint_pattern VARCHAR(500) NOT NULL DEFAULT '*',
    requests_per_minute INTEGER NOT NULL DEFAULT 60,
    burst_size INTEGER NOT NULL DEFAULT 10,
    window_type VARCHAR(30) NOT NULL DEFAULT 'sliding',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soulgate_rate_limits_tenant ON _soulgate_rate_limits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_soulgate_rate_limits_soulkey ON _soulgate_rate_limits(soulkey_id);
CREATE INDEX IF NOT EXISTS idx_soulgate_rate_limits_enabled ON _soulgate_rate_limits(enabled);

-- Access Rules
CREATE TABLE IF NOT EXISTS _soulgate_access_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    rule_type VARCHAR(30) NOT NULL,
    value VARCHAR(500) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soulgate_access_rules_tenant ON _soulgate_access_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_soulgate_access_rules_type ON _soulgate_access_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_soulgate_access_rules_enabled ON _soulgate_access_rules(enabled);

-- Upstreams
CREATE TABLE IF NOT EXISTS _soulgate_upstreams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    base_url VARCHAR(500) NOT NULL,
    health_endpoint VARCHAR(255) DEFAULT '/health',
    timeout_ms INTEGER NOT NULL DEFAULT 30000,
    retries INTEGER NOT NULL DEFAULT 1,
    strip_prefix BOOLEAN NOT NULL DEFAULT TRUE,
    circuit_breaker_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soulgate_upstreams_tenant ON _soulgate_upstreams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_soulgate_upstreams_name ON _soulgate_upstreams(name);
CREATE INDEX IF NOT EXISTS idx_soulgate_upstreams_status ON _soulgate_upstreams(status);

-- Request Log
CREATE TABLE IF NOT EXISTS _soulgate_request_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    soulkey_id UUID,
    persona_id VARCHAR(255),
    api_key_id UUID,
    method VARCHAR(10) NOT NULL,
    path TEXT NOT NULL,
    request_size_bytes INTEGER,
    response_status INTEGER,
    response_size_bytes INTEGER,
    response_time_ms FLOAT,
    upstream_name VARCHAR(100),
    blocked BOOLEAN NOT NULL DEFAULT FALSE,
    block_reason TEXT,
    threat_flags JSONB,
    source_ip VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soulgate_request_log_tenant ON _soulgate_request_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_soulgate_request_log_soulkey ON _soulgate_request_log(soulkey_id);
CREATE INDEX IF NOT EXISTS idx_soulgate_request_log_created ON _soulgate_request_log(created_at);
CREATE INDEX IF NOT EXISTS idx_soulgate_request_log_upstream ON _soulgate_request_log(upstream_name);
CREATE INDEX IF NOT EXISTS idx_soulgate_request_log_blocked ON _soulgate_request_log(blocked);

-- Circuit States
CREATE TABLE IF NOT EXISTS _soulgate_circuit_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upstream_id UUID NOT NULL UNIQUE,
    state VARCHAR(20) NOT NULL DEFAULT 'closed',
    failure_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soulgate_circuit_states_upstream ON _soulgate_circuit_states(upstream_id);
CREATE INDEX IF NOT EXISTS idx_soulgate_circuit_states_state ON _soulgate_circuit_states(state);

-- Threat Patterns
CREATE TABLE IF NOT EXISTS _soulgate_threat_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    pattern_type VARCHAR(20) NOT NULL DEFAULT 'regex',
    pattern TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    action VARCHAR(20) NOT NULL DEFAULT 'block',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soulgate_threat_patterns_tenant ON _soulgate_threat_patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_soulgate_threat_patterns_enabled ON _soulgate_threat_patterns(enabled);
CREATE INDEX IF NOT EXISTS idx_soulgate_threat_patterns_type ON _soulgate_threat_patterns(pattern_type);
