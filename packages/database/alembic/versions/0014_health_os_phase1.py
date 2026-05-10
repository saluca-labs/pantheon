"""Health OS Phase 1 — mental-health profile, consent, and risk flags.

Revision ID: 0014_health_os_phase1
Revises: 0013_agos_feature_flags
Create Date: 2026-05-10

Phase 1 of the Health OS build-out adds the foundation for the mental-
health vertical alongside a shared consent and risk-flag substrate that
both physical and mental health features will use.

Tables introduced
-----------------
- ``agos_mh_profile``       — one row per user; stress baseline, sleep
                              quality, support system, therapy/meds flags,
                              and self-defined goals.
- ``agos_health_consent``   — per-user, per-scope consent ledger
                              (physical / mental / integrations) with
                              latest-row-wins semantics.
- ``agos_health_risk_flag`` — append-only risk-signal store driven by
                              intake heuristics, screener scores, and the
                              shared crisis-language guard. Owners can
                              dismiss; flags are never mutated otherwise.

Naming convention
-----------------
- ``agos_mh_*``     — mental-health-vertical-only tables.
- ``agos_health_*`` — tables shared between physical and mental health.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS`` / ``CREATE INDEX IF
NOT EXISTS``) so first-boot bootstrap and re-applies are safe — same
pattern used by 0003_agentic_os.py and required by the offline-mode
fixes from PR #2 review.

License note: All DDL is original work under MIT. No GPL code is
introduced.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0014_health_os_phase1"
down_revision: Union[str, None] = "0013_agos_feature_flags"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Mental-health profile -----------------------------------------------------
-- One row per user; tenant_id is denormalized for tenant-scoped queries.
-- ``med_notes`` stays plaintext for now: pantheon does not yet expose a
-- column-level KEK helper to the agentic-os tree. When a shared encryption
-- helper lands (TIRESIAS_KEK pattern), this column should be migrated to
-- ciphertext + dek_id in a follow-up.
CREATE TABLE IF NOT EXISTS agos_mh_profile (
    user_id          UUID PRIMARY KEY,
    tenant_id        UUID NOT NULL,
    stress_baseline  INT,
    sleep_quality    TEXT,
    support_system   TEXT,
    current_therapy  BOOLEAN NOT NULL DEFAULT FALSE,
    current_meds     BOOLEAN NOT NULL DEFAULT FALSE,
    med_notes        TEXT,
    goals            JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_profile_stress_range
        CHECK (stress_baseline IS NULL OR (stress_baseline >= 0 AND stress_baseline <= 10)),
    CONSTRAINT agos_mh_profile_sleep_quality_enum
        CHECK (sleep_quality IS NULL OR sleep_quality IN ('poor','fair','good','excellent'))
);
CREATE INDEX IF NOT EXISTS agos_mh_profile_tenant_idx
    ON agos_mh_profile (tenant_id);

-- Consent ledger ------------------------------------------------------------
-- Append-only; ``setConsent`` updates the matching row in place to preserve
-- the latest-row-wins semantics. The unique index enforces a single row per
-- (user, scope); revoke is modeled by setting ``granted = FALSE`` and
-- writing ``revoked_at``.
CREATE TABLE IF NOT EXISTS agos_health_consent (
    id           UUID PRIMARY KEY,
    user_id      UUID NOT NULL,
    tenant_id    UUID NOT NULL,
    scope        TEXT NOT NULL,
    granted      BOOLEAN NOT NULL,
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at   TIMESTAMPTZ,
    metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT agos_health_consent_scope_enum
        CHECK (scope IN ('physical','mental','integrations'))
);
CREATE UNIQUE INDEX IF NOT EXISTS agos_health_consent_user_scope_uidx
    ON agos_health_consent (user_id, scope);
CREATE INDEX IF NOT EXISTS agos_health_consent_tenant_idx
    ON agos_health_consent (tenant_id);

-- Risk flags ----------------------------------------------------------------
-- Append-only signals with optional dismissal. Indexed for the two access
-- patterns we care about: "active flags for this user" and "all flags of
-- this kind/severity across the tenant" (analytics).
CREATE TABLE IF NOT EXISTS agos_health_risk_flag (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL,
    tenant_id             UUID NOT NULL,
    kind                  TEXT NOT NULL,
    severity              TEXT NOT NULL,
    source                TEXT NOT NULL,
    payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    dismissed_at          TIMESTAMPTZ,
    dismissed_by_user_id  UUID,
    CONSTRAINT agos_health_risk_flag_severity_enum
        CHECK (severity IN ('low','medium','high','critical'))
);
CREATE INDEX IF NOT EXISTS agos_health_risk_flag_user_active_idx
    ON agos_health_risk_flag (user_id, dismissed_at);
CREATE INDEX IF NOT EXISTS agos_health_risk_flag_kind_severity_idx
    ON agos_health_risk_flag (kind, severity);
CREATE INDEX IF NOT EXISTS agos_health_risk_flag_tenant_idx
    ON agos_health_risk_flag (tenant_id, created_at DESC);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_health_risk_flag_tenant_idx;
DROP INDEX IF EXISTS agos_health_risk_flag_kind_severity_idx;
DROP INDEX IF EXISTS agos_health_risk_flag_user_active_idx;
DROP TABLE IF EXISTS agos_health_risk_flag;

DROP INDEX IF EXISTS agos_health_consent_tenant_idx;
DROP INDEX IF EXISTS agos_health_consent_user_scope_uidx;
DROP TABLE IF EXISTS agos_health_consent;

DROP INDEX IF EXISTS agos_mh_profile_tenant_idx;
DROP TABLE IF EXISTS agos_mh_profile;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
