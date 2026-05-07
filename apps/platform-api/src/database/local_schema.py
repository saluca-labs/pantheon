"""
SQLite-compatible schema for SoulAuth local (ID) mode.
Translates the Postgres schema to SQLite:
  - UUID -> TEXT
  - JSONB -> TEXT (JSON stored as string)
  - TIMESTAMPTZ -> TEXT (ISO 8601 strings)
  - gen_random_uuid() -> not used (handled by app)
  - Partial indexes -> regular indexes
  - CHECK constraints preserved (SQLite supports them)
"""

SQLITE_SCHEMA = """
-- SoulAuth Local Schema (SQLite)

-- Tenant table
CREATE TABLE IF NOT EXISTS _soul_tenants (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    tier            TEXT NOT NULL DEFAULT 'free',
    status          TEXT NOT NULL DEFAULT 'active',
    metadata        TEXT DEFAULT '{}',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Soulkeys (agent identity credentials)
CREATE TABLE IF NOT EXISTS _soulkeys (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES _soul_tenants(id),
    persona_id      TEXT NOT NULL,
    key_hash        TEXT NOT NULL UNIQUE,
    label           TEXT,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'revoked')),
    issued_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    expires_at      TEXT,
    last_used_at    TEXT,
    suspended_at    TEXT,
    suspended_by    TEXT,
    revoked_at      TEXT,
    revoked_by      TEXT,
    revocation_reason TEXT,
    metadata        TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_soulkeys_hash ON _soulkeys(key_hash);
CREATE INDEX IF NOT EXISTS idx_soulkeys_tenant_persona ON _soulkeys(tenant_id, persona_id);
CREATE INDEX IF NOT EXISTS idx_soulkeys_active ON _soulkeys(status);

-- Policy Cache (resolved policies)
CREATE TABLE IF NOT EXISTS _soulauth_policy_cache (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES _soul_tenants(id),
    persona_id      TEXT NOT NULL,
    policy_version  TEXT NOT NULL,
    resolved_policy TEXT NOT NULL,
    synced_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(tenant_id, persona_id)
);

-- Audit Log (immutable trail)
CREATE TABLE IF NOT EXISTS _soulauth_audit (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    timestamp       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    event_type      TEXT NOT NULL,
    soulkey_id      TEXT,
    persona_id      TEXT,
    resource        TEXT,
    action          TEXT,
    scope           TEXT,
    decision        TEXT,
    reason          TEXT,
    capability_id   TEXT,
    context         TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON _soulauth_audit(tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_soulkey ON _soulauth_audit(soulkey_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_event ON _soulauth_audit(event_type);

-- Delegations (temporary scope expansions)
CREATE TABLE IF NOT EXISTS _soulauth_delegations (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    grantor_id      TEXT NOT NULL REFERENCES _soulkeys(id),
    grantee_persona TEXT NOT NULL,
    resource        TEXT NOT NULL,
    action          TEXT NOT NULL,
    scope           TEXT NOT NULL,
    granted_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    expires_at      TEXT NOT NULL,
    reason          TEXT,
    revoked_at      TEXT,
    revoked_by      TEXT
);

-- Trials (self-service trial provisioning)
CREATE TABLE IF NOT EXISTS _soulauth_trials (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT REFERENCES _soul_tenants(id),
    contact_name    TEXT NOT NULL,
    contact_email   TEXT NOT NULL,
    company_name    TEXT NOT NULL,
    company_domain  TEXT NOT NULL,
    use_case        TEXT,
    email_verified  INTEGER DEFAULT 0,
    verification_token TEXT,
    soulkey_id      TEXT REFERENCES _soulkeys(id),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'expired', 'converted', 'churned')),
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    activated_at    TEXT,
    expires_at      TEXT,
    converted_at    TEXT,
    metadata        TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_trials_email ON _soulauth_trials(contact_email);
CREATE INDEX IF NOT EXISTS idx_trials_domain ON _soulauth_trials(company_domain);
CREATE INDEX IF NOT EXISTS idx_trials_active ON _soulauth_trials(status);

-- Support Tickets
CREATE TABLE IF NOT EXISTS _support_tickets (
    id              TEXT PRIMARY KEY,
    ticket_id       TEXT NOT NULL UNIQUE,
    tenant_id       TEXT REFERENCES _soul_tenants(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','acknowledged','in_progress','resolved','closed')),
    severity        TEXT NOT NULL DEFAULT 'p2'
                    CHECK (severity IN ('p0','p1','p2','p3')),
    category        TEXT NOT NULL DEFAULT 'bug',
    subject         TEXT NOT NULL,
    description     TEXT NOT NULL,
    contact_email   TEXT,
    contact_name    TEXT,
    linear_url      TEXT,
    sla_deadline    TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    acknowledged_at TEXT,
    resolved_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON _support_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON _support_tickets(status);
"""


def get_sqlite_schema() -> str:
    """Return the full SQLite-compatible schema as a string."""
    return SQLITE_SCHEMA


def get_table_names() -> list[str]:
    """Return the list of tables created by the schema."""
    return [
        "_soul_tenants",
        "_soulkeys",
        "_soulauth_policy_cache",
        "_soulauth_audit",
        "_soulauth_delegations",
        "_soulauth_trials",
        "_support_tickets",
    ]
