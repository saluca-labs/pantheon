-- SoulAuth Database Schema
-- All tables as specified in SPEC.md

-- Tenant table (may already exist in production)
CREATE TABLE IF NOT EXISTS _soul_tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(63) NOT NULL UNIQUE,
    tier            VARCHAR(50) NOT NULL DEFAULT 'free',
    status          VARCHAR(50) NOT NULL DEFAULT 'active',
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Soulkeys (SPEC.md 3.2)
CREATE TABLE IF NOT EXISTS _soulkeys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES _soul_tenants(id),
    persona_id      TEXT NOT NULL,
    key_hash        TEXT NOT NULL UNIQUE,
    label           TEXT,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'revoked')),
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    suspended_at    TIMESTAMPTZ,
    suspended_by    TEXT,
    revoked_at      TIMESTAMPTZ,
    revoked_by      TEXT,
    revocation_reason TEXT,
    metadata        JSONB DEFAULT '{}'::jsonb,
    UNIQUE(tenant_id, persona_id, status)
);

CREATE INDEX IF NOT EXISTS idx_soulkeys_hash ON _soulkeys(key_hash);
CREATE INDEX IF NOT EXISTS idx_soulkeys_tenant_persona ON _soulkeys(tenant_id, persona_id);
CREATE INDEX IF NOT EXISTS idx_soulkeys_active ON _soulkeys(status) WHERE status = 'active';

-- Policy Cache (SPEC.md 4.5)
CREATE TABLE IF NOT EXISTS _soulauth_policy_cache (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES _soul_tenants(id),
    persona_id      TEXT NOT NULL,
    policy_version  TEXT NOT NULL,
    resolved_policy JSONB NOT NULL,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, persona_id)
);

-- Audit Log (SPEC.md 7.1)
CREATE TABLE IF NOT EXISTS _soulauth_audit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type      TEXT NOT NULL,
    soulkey_id      UUID,
    persona_id      TEXT,
    resource        TEXT,
    action          TEXT,
    scope           TEXT,
    decision        TEXT,
    reason          TEXT,
    capability_id   UUID,
    context         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON _soulauth_audit(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_soulkey ON _soulauth_audit(soulkey_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event ON _soulauth_audit(event_type);

-- Delegations (SPEC.md 8.3)
CREATE TABLE IF NOT EXISTS _soulauth_delegations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    grantor_id      UUID NOT NULL REFERENCES _soulkeys(id),
    grantee_persona TEXT NOT NULL,
    resource        TEXT NOT NULL,
    action          TEXT NOT NULL,
    scope           TEXT NOT NULL,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    reason          TEXT,
    revoked_at      TIMESTAMPTZ,
    revoked_by      TEXT
);

-- Trials (SPEC.md 16.3)
CREATE TABLE IF NOT EXISTS _soulauth_trials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES _soul_tenants(id),
    contact_name    TEXT NOT NULL,
    contact_email   TEXT NOT NULL,
    company_name    TEXT NOT NULL,
    company_domain  TEXT NOT NULL,
    use_case        TEXT,
    email_verified  BOOLEAN DEFAULT false,
    verification_token TEXT,
    soulkey_id      UUID REFERENCES _soulkeys(id),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'expired', 'converted', 'churned')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    converted_at    TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}'::jsonb,
    UNIQUE(company_domain, status)
);

CREATE INDEX IF NOT EXISTS idx_trials_email ON _soulauth_trials(contact_email);
CREATE INDEX IF NOT EXISTS idx_trials_domain ON _soulauth_trials(company_domain);
CREATE INDEX IF NOT EXISTS idx_trials_active ON _soulauth_trials(status) WHERE status = 'active';
