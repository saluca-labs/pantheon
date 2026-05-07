-- Migration: _soulgate_llm_policies
-- Purpose:   Per-tenant LLM request gate policy rows consulted by the proxy
--            via POST /gate/v1/llm/evaluate.  Ships with soulgate v2.5.0.
-- Safety:    Idempotent (IF NOT EXISTS), fully reversible via 0001_down.sql.
--            SoulGate's init_db() runs Base.metadata.create_all on boot, so
--            this file duplicates that work for operators who prefer a
--            declarative migration trail.  RLS policies are NOT created by
--            create_all and ARE REQUIRED for multi-tenant isolation — apply
--            this migration on Cloud SQL even though the table auto-creates.
--
-- Target:   salucainfrastructure:us-central1:tiresias-db
-- Apply via cloud-sql-proxy from any pod in the tiresias namespace that
-- has the cloud-sql-proxy sidecar (soulgate, tiresias-proxy, etc.) or via
-- `gcloud sql connect`.

BEGIN;

CREATE TABLE IF NOT EXISTS _soulgate_llm_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    soulkey_id UUID,
    persona_id VARCHAR(255),
    model_pattern VARCHAR(255) NOT NULL DEFAULT '*',
    endpoint_pattern VARCHAR(500) NOT NULL DEFAULT '/v1/chat/completions',
    action VARCHAR(20) NOT NULL DEFAULT 'allow',
    priority INTEGER NOT NULL DEFAULT 100,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    reason_code VARCHAR(128),
    reason TEXT,
    fail_mode VARCHAR(10),          -- open | closed | NULL (use env default)
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soulgate_llm_policies_tenant
    ON _soulgate_llm_policies (tenant_id);

CREATE INDEX IF NOT EXISTS idx_soulgate_llm_policies_lookup
    ON _soulgate_llm_policies (tenant_id, enabled, priority);

-- Row-Level Security: enforce tenant isolation at the DB layer.
-- SoulGate's async engine sets app.current_tenant via set_tenant_context
-- in the same pattern as other _soulgate_* tables.
ALTER TABLE _soulgate_llm_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE _soulgate_llm_policies FORCE ROW LEVEL SECURITY;

-- Drop-and-recreate the policy so re-runs converge on the same state.
DROP POLICY IF EXISTS soulgate_llm_policies_tenant_isolation
    ON _soulgate_llm_policies;

CREATE POLICY soulgate_llm_policies_tenant_isolation
    ON _soulgate_llm_policies
    USING (
        tenant_id::text = current_setting('app.current_tenant', true)
        OR current_setting('app.current_tenant', true) IS NULL
        OR current_setting('app.current_tenant', true) = ''
    )
    WITH CHECK (
        tenant_id::text = current_setting('app.current_tenant', true)
        OR current_setting('app.current_tenant', true) IS NULL
        OR current_setting('app.current_tenant', true) = ''
    );

COMMIT;
